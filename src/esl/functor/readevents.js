const CaseClass = require('js-helpers').CaseClass;

/**
 *	event-store-stream.EventStoreESL.Functor.ReadEvents
 *	written by Joel Dentici
 *	on 6/29/2017
 *
 *	Represents a request to read from a stream in the
 *	event store.
 */
class ReadEvents extends CaseClass {
	constructor(streamId, direction, start, count, continuation) {
		super('ReadEvents');
		this.streamId = streamId;
		this.direction = direction;
		this.start = start;
		this.count = count;
		this.continuation = continuation;
	}

	map(fn) {
		return new ReadEvents(
			this.streamId, this.direction, this.start,
			this.count, x => fn(this.continuation(x)));
	}

	doCase(fn) {
		return fn(this.streamId, this.direction,
		 this.start, this.count, this.continuation);
	}
}

module.exports = ReadEvents;