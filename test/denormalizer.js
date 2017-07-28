const λ = require('fantasy-check/src/adapters/nodeunit');

const {eq, Connection, writeEvent, createManager} = require('../test-lib.js');
const {identity, constant} = require('fantasy-combinators');

const client = require('../src');
const {Async, Maybe, ConcurrentFree: F, Utility} = require('monadic-js');
const oldScheduler = Async.setScheduler(x => x());
const Effector = client.Effector;
const CaseClass = Utility.CaseClass;
const StreamConnection = client.StreamConnection;
const transactional = require('transactional-db');

const statements = {
	'select * from blah': [{id: 1, a: '1', b: '2'}, {id: 2, a: '2', b: '3'}],
	'insert into blah(a,b) values(1,2)': {insertId: 3},
	'delete from blah where id = 1': null,
	'update blah set a = 2 where id = 1': null,
	'select * from blah where id = 1': [{id: 1, a: '1', b: '2'}],
	'select * from blah where id = 3': [],
	'select low_commit,high_commit,low_prepare,high_prepare from history': [{
		low_commit: 0,
		high_commit: 0,
		low_prepare: 0,
		high_prepare: 0,
	}],
};

statements[`update history set 
					low_commit = ?, high_commit = ?,
					low_prepare = ?, high_prepare = ?`] = null;


const manager1 = createManager(statements);
transactional.register('mysql-test-1', manager1.createManager);
const T = transactional.Transaction;

exports.Denormalizer = {
	'test': test => {
		const check = eq(test);

		const list = new transactional.Logging.ListMedia();
		const logger = transactional.Logging.makeLogger(
			list
		);

		const dbm = transactional.create('mysql-test-1', null, null, logger);
		const base = new Connection();
		const es = new Proxy(base, StreamConnection);

		const denormalizer = new client.Denormalizer(dbm, es, 0, 0);

		//our effect is to store the event in an in-memory list
		//when we encounter it
		denormalizer.map('TestEvent', ev => T.insert('blah', {
			a: ev.data.a,
			b: ev.data.b,
		}));

		const stream$ = denormalizer.start();

		stream$.subscribe({
			onNext: x => {},
			onError: e => {},
			onCompleted: _ => {
				check(list.items, [
					'BEGIN',
					'SELECT low_commit,high_commit,low_prepare,high_prepare from history',
					'COMMIT',
					'BEGIN',
					'INSERT into blah(a,b) VALUES(1,2)',
					'UPDATE history SET \n\t\t\t\t\tlow_commit = 0, high_commit = 0,\n\t\t\t\t\tlow_prepare = 0, high_prepare = 0',
					'COMMIT'
				])
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
	},
	'test2': test => {
		const check = eq(test);

		const list = new transactional.Logging.ListMedia();
		const logger = transactional.Logging.makeLogger(
			list
		);

		const dbm = transactional.create('mysql-test-1', null, null, logger);
		const base = new Connection();
		const es = new Proxy(base, StreamConnection);

		const denormalizer = new client.Denormalizer(dbm, es, 0, 0);

		//our effect is to store the event in an in-memory list
		//when we encounter it
		denormalizer.map('TestEvent', ev => T.insert('blah', {
			a: ev.data.a,
			b: ev.data.b,
		}));

		const stream$ = denormalizer.start();

		writeEvent(base, 'stream', 'TestEvent', {
			a: 1,
			b: 2
		})
		.then(_ => {
			base.all.forEach(s => s.stop());
		}).catch(e => console.error(e))
		.then(_ => {
			stream$.subscribe({
				onNext: x => {},
				onError: e => {},
				onCompleted: _ => {
					check(list.items, [
						'BEGIN',
						'SELECT low_commit,high_commit,low_prepare,high_prepare from history',
						'COMMIT',
						'BEGIN',
						'INSERT into blah(a,b) VALUES(1,2)',
						'UPDATE history SET \n\t\t\t\t\tlow_commit = 0, high_commit = 0,\n\t\t\t\t\tlow_prepare = 0, high_prepare = 0',
						'COMMIT'
					])
					test.done();
				}
			});	
		});
	},
}