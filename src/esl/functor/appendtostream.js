const CaseClass = require('js-helpers').CaseClass;

/**
 *	event-store-stream.EventStoreESL.Functor.AppendToStream
 *	written by Joel Dentici
 *	on 6/29/2017
 *
 *	Represents a request to append to a stream in the
 *	event store.
 */
class AppendToStream extends CaseClass {
	constructor(streamId, events, expectedVersion, next) {
		super('AppendToStream');
		this.streamId = streamId;
		this.events = events;
		this.expectedVersion = expectedVersion;
		this.next = next;
	}

	map(fn) {
		return new AppendToStream(
			this.streamId, this.events, this.expectedVersion,
			fn(this.next));
	}

	doCase(fn) {
		return fn(this.streamId, this.events, this.expectedVersion,
		 this.next);
	}
}

module.exports = AppendToStream;