const λ = require('fantasy-check/src/adapters/nodeunit');

const {eq, Connection, writeEvent} = require('../test-lib.js');
const {identity, constant} = require('fantasy-combinators');

const client = require('../src');
const {Async, Maybe, ConcurrentFree: F, Utility} = require('monadic-js');
const oldScheduler = Async.setScheduler(x => x());
const Effector = client.Effector;
const CaseClass = Utility.CaseClass;
const StreamConnection = client.StreamConnection;
const Rx = require('rx');

class StoreEvent extends CaseClass {
	constructor(event) {
		super();
		this.event = event;
	}

	doCase(fn) {
		return fn(this.event);
	}
}

class Interpreter {
	constructor(events) {
		this.events = events;
	}

	setup() {
		return Async.of();
	}

	transform(x) {
		return x.case({
			StoreEvent: event => {
				this.events.push(event);
				return Async.of();
			},
			default: () => {}
		});
	}

	cleanupSuccess() {
		return Async.of();
	}

	cleanupFail() {
		return Async.of();
	}
}

const storeEvent = event => F.liftF(new StoreEvent(event));

const interpreter = events => () => new Interpreter(events);

exports.Effector = {
	'test': test => {
		const check = eq(test);

		const base = new Connection();
		const es = new Proxy(base, StreamConnection);

		//we will store events into this list
		const events = [];

		const interpret = F.interpret(
			Async,
			F.Control.interpreter,
			interpreter(events)
		);

		const effector = new Effector(interpret, es, 0);

		//our effect is to store the event in an in-memory list
		//when we encounter it
		effector.map('TestEvent', storeEvent);

		const stream$ = effector.start()

		stream$.subscribe({
			onNext: x => {},
			onError: e => {},
			onCompleted: _ => {
				check(events.map(e => e.data), [{
					a: 1,
					b: 2
				}]);
				test.done();
			}
		});

		writeEvent(base, 'stream', 'TestEvent', {
			a: 1,
			b: 2
		})
		.then(_ => {
			base.all.forEach(s => s.stop());
		}).catch(e => console.error(e));
	}
}