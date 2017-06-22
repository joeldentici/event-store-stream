const {Transaction: T} = require('transactional-db');
const {doM} = require('monadic-js').Utility;
const Rx = require('rx');
const esClient = require('node-eventstore-client');

const Long = require('long');


/**
 *	event-store-stream.Denormalizer
 *	written by Joel Dentici
 *	on 6/20/2017
 *
 *	The denormalizer handles running boilerplate
 *	queries and loading event store events, so the
 *	user code only needs to worry about mapping from
 *	events to queries.
 *
 *	To use the denormalizer, you must ensure that your schema
 *	includes a table called "history" with a single column called
 *	"checkpoint" of type int. This is used to pick the first event
 *	to retrieve from the event store on a cold start, and it is updated
 *	every time a batch of events is processed, transactionally with
 *	the updates.
 */
class Denormalizer {
	/**
	 *	new :: DBHManager -> StreamConnection -> int -> int -> IBus -> Denormalizer
	 *
	 *	Creates a new denormalizer. Queries are ran on dbm, events
	 *	are loaded from es. If an optional event bus is supplied, then
	 *	events emitted by mappers will be published to it.
	 *
	 *	Events are loaded batchSize events at a time.
	 *
	 *	Events are buffered by the provided throttle time (milliseconds)
	 *	and processed together in the window they occur in.
	 */
	constructor(dbm, es, batchSize, throttle, eventBus = {publish: (_,__) => null}) {
		this.dbm = dbm;
		this.es = es;
		this.bus = eventBus;
		this.batchSize = batchSize;
		this.throttle = throttle;
		this.mappers = {};
	}

	/**
	 *	map :: Denormalizer -> string -> (Event -> Transaction ())
	 *
	 *	Register a function that maps events of a specific type
	 *	to queries on the database.
	 */
	map(eventType, mapper) {
		this.mappers[eventType] = mapper;
	}

	/**
	 *	start :: Denormalizer -> () -> ()
	 *
	 *	Start the denormalizer.
	 */
	start() {
		const eventTypes = Object.keys(this.mappers);
		const self = this;
		doM(function*() {
			//read checkpoint position from the database (this represents
			//the last event we processed)
			const [{low_commit, high_commit, low_prepare, high_prepare}] =
			 yield self.dbm.runTransaction(T.query(`
				SELECT low_commit,high_commit,low_prepare,high_prepare from history`));

			//turn the position read from database into an esClient Position
			let position;
			if (low_commit === 0 && high_commit === 0 && low_prepare === 0
				&& high_prepare === 0)
				position = null;
			else
				position = new esClient.Position(
					new Long(low_commit, high_commit),
					new Long(low_prepare, high_prepare));

			//load the $all event stream from the position
			//we just loaded
			const events$ = self.es
				.allFrom$(position, false, self.es.credentials, self.batchSize)
				.filter(interested(eventTypes))
				.buffer(Rx.Observable.interval(self.throttle))
				.filter(x => x.length); //ignore empty windows

			//run the denormalizer on the event stream
			self.run(events$);
		});
	}

	/**
	 *	run :: Denormalizer -> Observable Event -> ()
	 *
	 *	Processes events through the mappers and then
	 *	runs a transaction for each batch of events on
	 *	the database to update it.
	 */
	run(events$) {
		events$.forEach(events => {
			const self = this;
			this.dbm.runTransaction(doM(function*() {
				for (let event of events) {
					//map each event to a query and execute it
					yield T.continue(self.mappers[event.eventType](event));
				}

				//the events come to us in order of first to last, so
				//get the position from the last event we processed
				const position = events[events.length - 1].position;

				//extract the 32 bit fields from the position
				const low_commit = position.commitPosition.getLowBits();
				const high_commit = position.commitPosition.getHighBits();
				const low_prepare = position.preparePosition.getLowBits();
				const high_prepare = position.preparePosition.getHighBits();

				//store the 32 bit fields of the position to the database
				return T.query(`UPDATE history SET 
					low_commit = ?, high_commit = ?,
					low_prepare = ?, high_prepare = ?`,
					low_commit,
					high_commit,
					low_prepare,
					high_prepare);
			}), this.bus);
		});
	}
}

/**
 *	interested :: [string] -> Event -> bool
 *
 *	Creates a filter predicate for the specified event types
 */
function interested(eventTypes) {
	const types = new Set(eventTypes);
	return function(event) {
		return types.has(event.eventType);
	}
}

module.exports = Denormalizer;