const {doM} = require('monadic-js').Utility;
const Async = require('monadic-js').Async;
const client = require('node-eventstore-client');
const {simplifyEvent} = require('../util.js');

/**
 *	event-store-stream.EventStoreESL.Interpreter
 *	written by Joel Dentici
 *	on 6/29/2017
 *
 *	This interpreter maps the EventStoreESL expression to
 *	an Async computation.
 */
class Interpreter {
	/**
	 *	new :: StreamConnection -> UserCredentials -> int -> (Free f a -> Async a) -> Interpreter
	 *
	 *	Constructs a new instance of the interpreter.
	 */
	constructor(es, userCredentials, batchSize, execute) {
		this.es = es;
		this.userCredentials = userCredentials;
		this.batchSize = batchSize;
		this.execute = execute;

		/*
		 *	versions :: Map string int
		 *
		 *	use to lookup version number for
		 *	stream when starting a transaction
		 */
		this.versions = {};

		/*
		 *	transactions :: Map string EventStoreTransaction
		 *
		 *	use to lookup the transaction we are using
		 *	for a stream.
		 */
		this.transactions = {};
	}

	/**
	 *	prepare :: Interpreter -> () -> Async () ()
	 *
	 *	Prepares the interpreter's state to interpret
	 *	an EventStoreESL expression.
	 */
	prepare() {
		return Async.unit();
	}

	/**
	 *	map :: Interpeter -> EventStoreESL e a -> (Async e a, (a -> Free f b) | Free f b)
	 *
	 *	Maps the provided expression to an Async computation.
	 */
	map(expr) {
		const es = this.es;
		const cred = this.userCredentials;
		const bSize = this.batchSize;
		const versions = this.versions;
		const transactions = this.transactions;
		return expr.case({
			ReadFromStream: (sid, en, n) => {
				const result = doM(function*() {
					yield Async.unit();

					//if a transaction is started,
					//commit it.
					const trans = transactions[sid];
					if (trans) {
						yield Async.wrapPromise(trans.commit.bind(trans))();

						delete transactions[sid];
					}

					const events$ = es.streamFrom$(sid, en, 
						false, cred, bSize, true);

					//store event number once all events
					//are read.
					events$
						.startWith({eventNumber: undefined})
						.last()
						.toPromise()
						.then(ev => {
							versions[sid] = ev.eventNumber;
						});

					return Async.unit(events$);
				});

				return [result, n];
			},
			AppendToStream: (sid, ed, ev, n) => {
				//version to use if starting new transaction
				const version = ev > -1 ? ev : 
					(versions[sid] || client.expectedVersion.any);

				const result = doM(function*() {
					//if user provides an expected version
					//and transaction is open, commit it.
					const oldTrans = transactions[sid];
					if (ev > -1 && oldTrans) {
						yield Async.wrapPromise(
							oldTrans.commit.bind(oldTrans)
						)();

						delete transactions[sid];
					}

					//if no transaction is started, start one
					if (!transactions[sid]) {
						transactions[sid] = yield Async.wrapPromise(
							es.startTransaction.bind(es)
						)(sid, version, cred);
					}

					//append the event(s)
					const trans = transactions[sid];
					yield Async.wrapPromise(trans.write.bind(trans))(ed);

					return Async.unit();
				});

				return [result, n];
			},
			CommitStream: (sid, n) => {
				const result = doM(function*() {
					const trans = transactions[sid];
					if (trans) {
						yield Async.wrapPromise(trans.commit.bind(trans))();

						delete transactions[sid];
					}

					return Async.unit();
				});

				return [result, n];
			},
			'ReadEvents': (sid, dir, s, c, n) => {
				const actions = {
					'forward': es.readStreamEventsForward.bind(es),
					'backward': es.readStreamEventsBackward.bind(es),
				};
				const action = Async.wrapPromise(actions[dir]);

				const result = action(sid, s, c, false, cred)
					.map(slice => slice.events)
					.map(events => events.map(simplifyEvent));

				return [result, n];
			}
		});
	}

	/**
	 *	cleanup :: Interpreter -> a -> Async e a
	 *
	 *	Cleans up the resources used by the interpreter.
	 */
	cleanup(res) {
		const transactions = Object.keys(this.transactions)
			.map(k => this.transactions[k]);

		//commit all started transactions
		return doM(function*() {
			for (let trans of transactions) {
				yield Async.wrapPromise(trans.commit.bind(trans))();
			}

			return Async.unit();
		});
	}

	/**
	 *	cleanupErr : Interpreter -> e -> Async e ()
	 *
	 *	Cleans up the resources used by the interpreter,
	 *	when an error during interpretation occurs.
	 */
	cleanupErr(err) {
		const transactions = Object.keys(this.transactions)
			.map(k => this.transactions[k]);

		//rollback all started transactions
		return doM(function*() {
			for (let trans of transactions) {
				try {
					trans.rollback();
				} catch (e) {}
			}

			return Async.unit();
		});
	}
}

/**
 *	interpreter :: StreamConnection -> UserCredentials -> int -> (Free f a -> Async a) -> Interpreter
 *
 *	Creates an interpreter constructor for the specified
 *	stream connection.
 */
module.exports = (es, userCredentials, batchSize) => 
	execute => new Interpreter(es, userCredentials, batchSize, execute);