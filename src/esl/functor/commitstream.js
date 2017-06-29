const CaseClass = require('js-helpers').CaseClass;

/**
 *	event-store-stream.EventStoreESL.Functor.CommitStream
 *	written by Joel Dentici
 *	on 6/29/2017
 *
 *	Represents a request to commit writes to a stream in the
 *	event store.
 */
class CommitStream extends CaseClass {
	constructor(streamId, next) {
		super('CommitStream');
		this.streamId = streamId;
		this.next = next;
	}

	map(fn) {
		return new CommitStream(this.streamId, fn(this.next));
	}

	doCase(fn) {
		return fn(this.streamId, this.next);
	}
}

module.exports = CommitStream;