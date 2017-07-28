const λ = require('fantasy-check/src/adapters/nodeunit');

const {eq, Connection, writeEvent} = require('../test-lib.js');
const {identity, constant} = require('fantasy-combinators');

const client = require('../src');
const {Async, Maybe, ConcurrentFree: F, Utility} = require('monadic-js');
const oldScheduler = Async.setScheduler(x => x());
const StreamConnection = client.StreamConnection;

exports.Connection = {
	'test': test => {
		const check = eq(test);

		const base = new Connection();
		const es = new Proxy(base, StreamConnection);

		const stream$ = es.stream$('stream', false, null).run();

		const events = [];

		stream$.subscribe({
			onNext: x => {events.push(x)},
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
			base.subscriptions['stream'].forEach(s => s.stop());
		}).catch(e => console.error(e));
	}
}