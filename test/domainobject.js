const λ = require('fantasy-check/src/adapters/nodeunit');

const {eq, Connection, writeEvent, wrapEvent} = require('../test-lib.js');
const {identity, constant} = require('fantasy-combinators');

const client = require('../src');
const {Async, Maybe, ConcurrentFree: F, Utility} = require('monadic-js');
//const oldScheduler = Async.setScheduler(x => x());
const StreamConnection = client.StreamConnection;

const StoreDSL = client.StoreDSL;
const interpreter = StoreDSL.interpreter;
const DomainObject = client.DomainObject;

class ShoppingCartCreated {
	constructor(name) {
		this.name = name;
	}
}

class ProductAdded {
	constructor(name, price) {
		this.name = name;
		this.price = price;
	}
}

class Snapshot {
	constructor(state) {
		this.state = state;
	}
}

class ShoppingCart extends DomainObject {
	static doCreate(name) {
		return new ShoppingCartCreated(name);
	}

	applyEvent(ev) {
		return ev.case({
			ShoppingCartCreated: ({name}) => ({name, items: []}),
			ProductAdded: ({name, price}) => ({items: this.items.concat({name,price})}),
			Snapshot: state => state,
		});
	}

	addProduct(name, price) {
		return this.addEvent(new ProductAdded(name, price));
	}

	snapshot() {
		return new Snapshot(this);
	}
}

exports.DomainObject = {
	'test': test => {
		const check = eq(test);

		const base = new Connection(wrapEvent);
		const es = new Proxy(base, StreamConnection);

		const interpret = F.interpret(
			Async,
			F.Control.interpreter,
			interpreter(es, null, 0)
		);

		const prog = ShoppingCart.create('blah')
			.chain(cart => cart.addProduct('Chocolate', 10)
				.chain(c => StoreDSL.commitStream('ShoppingCart-'+c.id).map(_ => c))
			)
			.chain(x => {
				return ShoppingCart.load(x.id).chain(
					cart => cart.addProduct('Candy', 11));
			});

		interpret(prog).fork(x => {
			check(x.name, 'blah');
			check(x.items, [{name: 'Chocolate', price: 10}, {name: 'Candy', price: 11}]);
			check(base.events['ShoppingCart-'+x.id].length, 3);

			test.done();
		}, e => console.error(e))
	}
}