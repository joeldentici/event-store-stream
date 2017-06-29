const CaseClass = require('js-helpers').CaseClass;

/**
 *	event-store-stream.EventStoreESL.Functor.ReadFromStream
 *	written by Joel Dentici
 *	on 6/29/2017
 *
 *	Represents a request to read from a stream in the
 *	event store.
 */
class ReadFromStream extends CaseClass {
	constructor(streamId, eventNumber, continuation) {
		super('ReadFromStream');
		this.streamId = streamId;
		this.eventNumber = eventNumber;
		this.continuation = continuation;
	}

	map(fn) {
		return new ReadFromStream(
			this.streamId, this.eventNumber, x => fn(this.continuation(x)));
	}

	doCase(fn) {
		return fn(this.streamId, this.eventNumber, this.continuation);
	}
}

module.exports = ReadFromStream;