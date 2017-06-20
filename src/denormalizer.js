/**
 *	Denormalizer
 *	written by Joel Dentici
 *	on 6/20/2017
 *
 *	The denormalizer handles running boilerplate
 *	queries and loading event store events, so the
 *	user code only needs to worry about mapping from
 *	events to queries.
 */
class Denormalizer {
	/**
	 *	new :: DatabaseManager -> StreamConnection -> int -> int
	 *
	 *	Creates a new denormalizer. Queries are ran on dbm, events
	 *	are loaded from es.
	 *
	 *	Events are loaded batchSize events at a time.
	 *
	 *	Events are buffered by the provided throttle time (milliseconds)
	 *	and processed together in the window they occur in.
	 */
	constructor(dbm, es, batchSize, throttle) {
		this.dbm = dbm;
		this.es = es;
		this.batchSize = batchSize;
		this.throttle = throttle;
		this.mappers = {};
	}

	/**
	 *	map :: string -> (Event -> Transactional ())
	 *
	 *	Register a function that maps events of a specific type
	 *	to queries on the database.
	 */
	map(eventType, mapper) {
		this.mappers[eventType] = mapper;
	}

	/**
	 *	start :: () -> ()
	 *
	 *	Start the denormalizer.
	 */
	start() {
		const eventTypes = Object.keys(this.mappers);
		const self = this;
		doM(function*() {
			const checkpoint = yield self.dbm.runTransaction(T.query(`
				SELECT checkpoint from history`));

			const events$ = es
				.allFrom$(checkpoint, false, es.credentials, self.batchSize)
				.filter(interested(eventTypes))
				.buffer(Rx.Observable.interval(self.throttle));

			self.run(events$);
		});
	}

	/**
	 *	run :: Observable Event -> ()
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
					yield self.mappers(event);
				}

				const lastEvent = events[events.length - 1];

				return T.query(`UPDATE history SET checkpoint = ?`, lastEvent.eventId);
			}));
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