const ReadFromStream = require('./functor/readfromstream.js');
const AppendToStream = require('./functor/appendtostream.js');
const CommitStream = require('./functor/commitstream.js');
const ReadEvents = require('./functor/readevents.js');
const Free = require('monadic-js').Free;

/**
 *	event-store-stream.EventStoreESL
 *	written by Joel Dentici
 *	on 6/29/2017
 *
 *	The ESL (Effect Specific Language) for Event
 *	Store allows the creation of composable transactions
 *	on the Event Store.
 *
 *	An ESL expression automatically handles the creation
 *	of a transaction whenever a stream is first written to and attempts
 *	to commit all open transactions after it finishes running.
 *
 *	Interpreter behavior:
 *		When a stream has no transaction open:
 *			If we read from the stream, the expected version becomes
 *			the last eventNumber read
 *
 *			If we write to a stream, a transaction is opened and the
 *			stored last eventNumber from reading is used as the expectedVersion
 *
 *			If we write to a stream, we can also provide an expectedVersion
 *			number for the transaction.
 *
 *		When a stream has a transaction open:
 *			Attempting to read from the stream will commit the current transaction.
 *			See above for how the next transaction is affected
 *
 *			Writing will simply write to the underlying transaction. Specifying an
 *			expected verion will commit the current transaction, then create a new
 *			one as above
 *
 *			
 */
class EventStoreESL {
	/**
	 *	readFromStream :: string -> int -> EventStoreESL (StreamDeletedError | AccessDeniedError) (Observable Event ())
	 *
	 *	Gets an Observable sequence of events from the specified stream,
	 *	starting at the specified event number in the stream.
	 */
	static readFromStream(streamId, eventNumber = 0) {
		return Free.liftF(new ReadFromStream(streamId, eventNumber, x => x));
	}

	/**
	 *	appendToStream :: string -> [EventData] | EventData -> int -> EventStoreESL EventStoreError ()
	 *
	 *	Appends an event (or events) to a stream. This will always take place within
	 *	an EventStore transaction.
	 */
	static appendToStream(streamId, eventData, expectedVersion = -1) {
		return Free.liftF(new AppendToStream(streamId, eventData,
			expectedVersion, x => x));
	}

	/**
	 *	commitStream :: string -> EventStoreESL EventStoreError ()
	 *
	 *	Commits the transaction for the specified stream.
	 */
	static commitStream(streamId) {
		return Free.liftF(new CommitStream(streamId, x => x));
	}

	/**
	 *	readEvents :: string -> int -> int -> 'forward' | 'backward' -> EventStoreESL EventStoreError [Event]
	 *
	 *	Reads events from the event stream in the specified direction.
	 *
	 *	If reading backwards, then negative starting values can be used, where
	 *	-1 is the last event, -2 is the second to last event, and so on.
	 *
	 *	Direction is forward if not specified.
	 */
	static readEvents(streamId, start, count, direction = 'forward') {
		return Free.liftF(new ReadEvents(streamId, direction,
			start, count, x => x));
	}

	/**
	 *	readEvent :: string -> int -> EventStoreESL EventStoreError Event
	 *
	 *	Reads a single event from the event stream. Use negative position to
	 *	read from end of stream, where -1 is the last event, -2 is the second to last,
	 *	and so on.
	 */
	static readEvent(streamId, position) {
		return EventStoreESL.readEvents(streamId, position, 1, 'backward')
			.map(events => events[0]);
	}

	/**
	 *	unit :: a -> EventESL () a
	 *
	 *	Put a value into the ESL context.
	 */
	static unit(value) {
		return Free.unit(value);
	}
}

EventStoreESL.interpreter = require('./interpreter.js');

module.exports = EventStoreESL;