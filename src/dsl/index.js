const Free = require('monadic-js').ConcurrentFree;
const CaseClass = require('js-helpers').CaseClass;

/**
 *	event-store-stream.StoreDSL
 *	written by Joel Dentici
 *	on 6/29/2017
 *
 *	The DSL for Event Store allows the creation of composable transactions
 *	on the Event Store.
 *
 *	A DSL instruction automatically handles the creation
 *	of a transaction whenever a stream is first written to and attempts
 *	to commit all open transactions after it finishes running.	
 */
class StoreDSL {
	/**
	 *	readFromStream :: string -> int -> StoreDSL (StreamDeletedError | AccessDeniedError) (Observable Event ())
	 *
	 *	Gets an Observable sequence of events from the specified stream,
	 *	starting at the specified event number in the stream.
	 */
	static readFromStream(streamId, eventNumber = 0) {
		return Free.liftF(new ReadFromStream(streamId, eventNumber));
	}

	/**
	 *	appendToStream :: string -> [EventData] | EventData -> int -> StoreDSL EventStoreError ()
	 *
	 *	Appends an event (or events) to a stream. This will always take place within
	 *	an EventStore transaction.
	 */
	static appendToStream(streamId, eventData, expectedVersion = -1) {
		return Free.liftF(new AppendToStream(streamId, eventData,
			expectedVersion));
	}

	/**
	 *	commitStream :: string -> StoreDSL EventStoreError ()
	 *
	 *	Commits the transaction for the specified stream.
	 */
	static commitStream(streamId) {
		return Free.liftF(new CommitStream(streamId));
	}

	/**
	 *	readEvents :: string -> int -> int -> 'forward' | 'backward' -> StoreDSL EventStoreError [Event]
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
			start, count));
	}

	/**
	 *	readEvent :: string -> int -> StoreDSL EventStoreError Event
	 *
	 *	Reads a single event from the event stream. Use negative position to
	 *	read from end of stream, where -1 is the last event, -2 is the second to last,
	 *	and so on.
	 */
	static readEvent(streamId, position) {
		return StoreDSL.readEvents(streamId, position, 1, 'backward')
			.map(events => events[0]);
	}

	/**
	 *	unit :: a -> StoreDSL () a
	 *
	 *	Put a value into the ESL context.
	 *
	 *	Aliases: of
	 */
	static unit(value) {
		return Free.unit(value);
	}

	static of(value) {
		return StoreDSL.unit(value);
	}
}

/* "ADT" of our instructions */
class AppendToStream extends CaseClass {
	constructor(streamId, events, expectedVersion) {
		super();
		this.streamId = streamId;
		this.events = events;
		this.expectedVersion = expectedVersion;
	}

	doCase(fn) {
		return fn(this.streamId, this.events, this.expectedVersion);
	}
}

class CommitStream extends CaseClass {
	constructor(streamId) {
		super();
		this.streamId = streamId;
	}

	doCase(fn) {
		return fn(this.streamId);
	}
}

class ReadEvents extends CaseClass {
	constructor(streamId, direction, start, count) {
		super();
		this.streamId = streamId;
		this.start = start;
		this.count = count;
		this.direction = direction;
	}

	doCase(fn) {
		return fn(this.streamId, this.direction, this.start, this.count);
	}
}

class ReadFromStream extends CaseClass {
	constructor(streamId, eventNumber) {
		super();
		this.streamId = streamId;
		this.eventNumber = eventNumber;
	}

	doCase(fn) {
		return fn(this.streamId, this.eventNumber);
	}
}

/* Our StoreDSL -> Async interpreter */
StoreDSL.interpreter = require('./interpreter.ejs');

module.exports = StoreDSL;