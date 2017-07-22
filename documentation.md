# Event Store Stream Documentation

## Modules:
Click a module name below to see its documentation

* [event-store-stream](#event-store-stream)
* [event-store-stream.Denormalizer](#event-store-stream-denormalizer)
* [event-store-stream.DomainObject](#event-store-stream-domainobject)
* [event-store-stream.StoreDSL](#event-store-stream-storedsl)
* [event-store-stream.StoreDSL.Interpreter](#event-store-stream-storedsl-interpreter)
* [event-store-stream.StreamConnection](#event-store-stream-streamconnection)
* [event-store-stream.util](#event-store-stream-util)
## event-store-stream
<a name="event-store-stream"></a>
**Written By:** Joel Dentici

**Written On:** 6/19/2017

Wraps the node-eventstore-client to
provide RxJS Observables (event streams)
of subscriptions, in addition to having
a callback based version.

The methods from the node-eventstore-client
connection are dispatched to automatically,
so this can be used in place of it directly.
#### createStreamConnection :: Object &#8594; string &#8594; StreamConnection

Creates a connection to the event store that supports creating
RxJS Observable streams of subscriptions.
## event-store-stream.Denormalizer
<a name="event-store-stream-denormalizer"></a>
**Written By:** Joel Dentici

**Written On:** 6/20/2017

A Denormalizer provides a layer between queries/statements
to update a read model and the Event Store that conveniently
keeps track of your position in the Event Store and running your
statements in a transaction.

All you need to do for setup is provide the event store connection and database
manager to the denormalizer. Then you register each of your read model updaters
to map specific events to statements by calling `.map`. Once you have registered
all of your updaters, call `.start` to begin the denormalization process.

There is no need for shutdown logic, since if this is in the middle of processing
an update transaction when the server is killed, it will resume safely at the same
point the next time it is brought up.
#### interested :: [string] &#8594; Event &#8594; bool

Creates a filter predicate for the specified event types
#### map :: Denormalizer &#8594; (string, Event &#8594; Transaction ()) &#8594; ()

Register a function that maps events of a specific type
to queries on the database.
#### new :: (DBHManager, StreamConnection, int, int, IBus) &#8594; Denormalizer

Creates a new denormalizer. Queries are ran on dbm, events
are loaded from es. If an optional event bus is supplied, then
events emitted by mappers will be published to it.

Events are loaded batchSize events at a time.

Events are buffered by the provided throttle time (milliseconds)
and processed together in the window they occur in.
#### run :: Denormalizer &#8594; Observable [Event] &#8594; ()

Processes events through the mappers and then
runs a transaction for each batch of events on
the database to update it.

This is written such that if a new window of events
comes in while the previous window is being processed,
processing of the new window is delayed until the previous
window finishes. This ensures that all events are always
processed in the order they are received.
#### start :: Denormalizer &#8594; () &#8594; ()

Start the denormalizer.
## event-store-stream.DomainObject
<a name="event-store-stream-domainobject"></a>
**Written By:** Joel Dentici

**Written On:** 7/21/2017

A DomainObject represents any domain object that
you store in the Event Store. This abstracts the interaction
with the EventStore that is necessary for domain objects, so
you can focus on just implementing your domain logic.

You need to do 4 things:

 Create an object without a constructor that extends DomainObject
 Add a static method `doCreate` that accepts any arguments and returns an Event
 Add an instance method `applyEvent` that accepts an event and returns a change map
 Add an instance method `snapshot` that returns a snapshot event

A change map is simply an object whose properties give the new values for the
fields of your domain object. To unset a field, set the property value to undefined.

After you have satisfied the interface, you can add any number of domain-level methods
to your object that allow other parts of your system to interact with it at a domain-level.

Note the methods provided by DomainObject return values in the StoreDSL. This implies that
you need to work with it as well, and interpret it with the StoreDSL interpreter and your event
store connection for anything to happen. This is actually a good thing as it removes the burden
of injecting an event store connection to each domain object, and simply requires you interpret
the resulting StoreDSL at the service level and run the resulting Async computation at the application
level.
#### _applyEvent :: DomainObject &#8594; (DomainEvent, int) &#8594; DomainObject

Returns a new instance of this type representing the same domain
object in the state arrived at by applying the provided event.
#### _snapshot :: DomainObject &#8594; () &#8594; StoreDSL Error DomainObject

Takes a snapshot of the current domain object state.
#### addEvent :: DomainObject &#8594; (Object, bool) &#8594; StoreDSL Error DomainObject

Adds an event to the domain object.
#### applyEvent :: DomainObject &#8594; DomainEvent &#8594; Object

Returns changes to apply to this object in response to
an event.

This should be overridden by Subclasses and should work
with all events that may be applied to them (including historical
ones that are no longer created).
#### create :: ...any &#8594; StoreDSL Error DomainObject

Creates a new instance of the domain object.

Subclasses of DomainObject should provide a static
<code>.doCreate</code> method that takes the arguments
and returns an event signifying creation of the object.
#### DomainEvent :: CaseClass

A domain event is a case-analyzable object
with the original constructor name used to
create it. We map both events that are loaded
from the Event Store and events that are added
at runtime to this before applying them. This allows
the applyEvent method to perform case analysis on
the events easily.
#### load :: (UUID, int) &#8594; StoreDSL Error DomainObject

Loads the domain object with the specified id up to the
specified version. Snapshots will be used for efficient loading
when no version is specified (the latest version).

If a specific version is specified and the latest snapshot
is after it, then the event stream will be read from the beginning!
This should be fine since loading a version other than the latest is
very rare and only needs to be done to correct errors from buggy user code.

Subclasses don't need to do anything to use this.
#### new :: UUID &#8594; int &#8594; Object &#8594; DomainObject

Constructs a new DomainObject instance.
#### toDomainEvent :: (string, string, Object) &#8594; DomainEvent

Creates a domain event given the name of the DomainObject
it will be applied to, its own original constructor name, and
the data that was loaded from the Event Store. This is used with
events loaded from the Event Store.

This essentially just removes the "namespacing" we applied
to the event before storing it, since that is unnecessary when
performing case analysis on it inside its own DomainObject.
#### toStorableEvent :: (string, Object) &#8594; JsonEventData

Creates event data to be stored to the Event Store from
an event. Events are "namespaced" under the type of DomainObject
they are being added to.
## event-store-stream.StoreDSL
<a name="event-store-stream-storedsl"></a>
**Written By:** Joel Dentici

**Written On:** 6/29/2017

The DSL for Event Store allows the creation of composable transactions
on the Event Store.

A DSL instruction automatically handles the creation
of a transaction whenever a stream is first written to and attempts
to commit all open transactions after it finishes running.
#### appendToStream :: string &#8594; [EventData] | EventData &#8594; int &#8594; StoreDSL EventStoreError ()

Appends an event (or events) to a stream. This will always take place within
an EventStore transaction.
#### commitStream :: string &#8594; StoreDSL EventStoreError ()

Commits the transaction for the specified stream.
#### readEvent :: string &#8594; int &#8594; StoreDSL EventStoreError Event

Reads a single event from the event stream. Use negative position to
read from end of stream, where -1 is the last event, -2 is the second to last,
and so on.
#### readEvents :: string &#8594; int &#8594; int &#8594; 'forward' | 'backward' &#8594; StoreDSL EventStoreError [Event]

Reads events from the event stream in the specified direction.

If reading backwards, then negative starting values can be used, where
-1 is the last event, -2 is the second to last event, and so on.

Direction is forward if not specified.
#### readFromStream :: string &#8594; int &#8594; StoreDSL (StreamDeletedError | AccessDeniedError) (Observable Event ())

Gets an Observable sequence of events from the specified stream,
starting at the specified event number in the stream.
#### unit :: a &#8594; StoreDSL () a

Put a value into the ESL context.

Aliases: of
## event-store-stream.StoreDSL.Interpreter
<a name="event-store-stream-storedsl-interpreter"></a>
**Written By:** Joel Dentici

**Written On:** 6/29/2017

This interpreter maps the StoreDSL instructions to
an Async computation.
#### commit :: ((Map string EventStoreTransaction), int, bool) &#8594; Async () EventStoreError ()

Commits the transaction for a stream if it exists and the
specified condition is true.
#### commitT :: EventStoreTransaction &#8594; Async () EventStoreError ()

Commits an event store transaction.
#### getVersion :: ((Map string int), string, int) &#8594; int

Gets the version to start a new transaction with.

If the specified version is > -1, then it is used,
otherwise the stored version for the stream is used.
#### interpreter :: StreamConnection &#8594; UserCredentials &#8594; int &#8594; (Free f a &#8594; Async a) &#8594; Interpreter

Creates an interpreter constructor for the specified
stream connection.
#### setTransaction :: (EventStoreTransaction, string, (Map string EventStoreTransaction)) &#8594; ()

Stores the transaction for the stream
#### updateVersion :: (Observable Event, string, Map string int) &#8594; ()

Updates the event version in versions with the last event
in a stream.
## event-store-stream.StreamConnection
<a name="event-store-stream-streamconnection"></a>
**Written By:** Joel Dentici

**Written On:** 6/19/2017

Adds methods to the event store connection
to create RxJS Observable streams for stream
subscriptions.
#### all$ :: StreamConnection &#8594; bool &#8594; UserCredentials &#8594; Observable Event

Returns an Observable of all event streams.
#### allFrom$ :: StreamConnection &#8594; Position &#8594; bool &#8594; UserCredentials &#8594; int &#8594; bool &#8594; Observable Event

Returns an Observable of all event streams. This stream starts at
the desired position, loads all events from there up in batchSize increments,
and then finally subscribes to the live stream once all old events are processed.

If the final parameter is true, then the resulting Observable will complete after catching up
to the latest event. This can be used with an initial aggregate and reduce to apply events to an
aggregate.

If the final parameter is false, then the subscription is kept open and the Observable will receive
live events.
#### createStream :: (Observer &#8594; Promise Subscription Error) &#8594; Observable Event Error

Create an RxJS Observable stream from subscription. This handles disposal of
the subscription on Observable disposal and errors with subscription.
#### stream$ :: StreamConnection &#8594; string &#8594; bool &#8594; UserCredentials &#8594; Observable Event

Returns an Observable of the requested event stream.
#### streamFrom$ :: StreamConnection &#8594; string &#8594; int &#8594; bool &#8594; UserCredentials &#8594; int &#8594; bool &#8594; Observable Event

Returns an Observable of the requested event stream. This stream starts at
the desired position, loads all events from there up in batchSize increments,
and then finally subscribes to the live stream once all old events are processed.

If the final parameter is true, then the resulting Observable will complete after catching up
to the latest event. This can be used with an initial aggregate and reduce to apply events to an
aggregate.

If the final parameter is false, then the subscription is kept open and the Observable will receive
live events.
## event-store-stream.util
<a name="event-store-stream-util"></a>
**Written By:** Joel Dentici

**Written On:** 6/29/2017

Utility functions used internally.
#### simplifyEvent :: ResolvedEvent &#8594; Event

Simplifies the event object from the one returned
by the Event Store.
