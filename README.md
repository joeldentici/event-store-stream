# event-store-stream
[![Build Status](https://travis-ci.org/joeldentici/event-store-stream.png?branch=master)](https://travis-ci.org/joeldentici/event-store-stream)
[![Coverage Status](https://coveralls.io/repos/github/joeldentici/event-store-stream/badge.png?branch=master)](https://coveralls.io/github/joeldentici/event-store-stream?branch=master)

This package adds some features to `node-eventstore-client`. These include:
  * Subscribing to streams in the Event Store and getting back an Observable of events
  	* Events that are read this way come back in a flattened form, so you can focus on the semantics of your own application instead of dealing with what the EventStore returns
  * A DSL to interact with the Event Store using Free Monads
  * A DomainObject abstraction that can be used along with the DSL to create domain objects/aggregates that use the event sourcing model
  * A Denormalizer object that can be used to easily map from Events to Queries, without worrying about all the details
  	* This expects you to use `transactional-db` for your queries
  * An Effector object that can be used like the Denormalizer, but for more generic side-effects
  	* You need to provide an interpreter for your effects

## install
Run `npm install --save event-store-stream` to use this package in your project.

## Observable subscriptions
Try running the two applications below side-by-side to see this working.

Running the application below will load the stream as an observable and then log each event to the console that occurs on it.
```js
var client = require('event-store-stream');
var streamName = "testStream";

const credentials = new client.UserCredentials("admin", "changeit")

const connSettings = {};  // Use defaults
const connection = client.createStreamConnection(connSettings, "tcp://localhost:1113");
connection.connect();
connection.once('connected', function (tcpEndPoint) {
	const stream$ = connection.stream$(streamName, false, credentials);
	stream$
		.forEach(x => console.log(x));
});
```

Running the application below will store an event to the same event stream used above.
```js
var esClient = require('event-store-stream');
var uuid = require('uuid');

var streamName = "testStream";

var connSettings = {};  // Use defaults
var esConnection = esClient.createConnection(connSettings, "tcp://localhost:1113");
esConnection.connect();
esConnection.once('connected', function (tcpEndPoint) {
    console.log('Connected to eventstore at ' + tcpEndPoint.host + ":" + tcpEndPoint.port);
});

var eventId = uuid.v4();
var eventData = {
    a : Math.random(), 
    b: uuid.v4()
};
var event = esClient.createJsonEventData(eventId, eventData, null, 'testEvent');
console.log("Appending...");
esConnection.appendToStream(streamName, esClient.expectedVersion.any, event)
    .then(function(result) {
        console.log("Stored event:", eventId);
        console.log("Look for it at: http://localhost:2113/web/index.html#/streams/testStream");
        esConnection.close();
    })
    .catch(function(err) {
        console.log(err);
    });
```

## Domain Objects
The DomainObject class takes care of all the interaction with the Event Store for you and lets you focus on actually creating the domain objects that make up your solution. Because it is based on a DSL using a Free monad, you also don't need to worry about nasty dependency injection or magical dependency injection frameworks. You simply put a service object in front of one or more domain objects and interpret the resulting "program" from using them. Only at that point do you need to actually provide a connection to the Event Store. Because the DSL can be composed with other Free Monad DSLs, you can also incorporate other effects into your domain objects without having to inject dependencies as well. This is all very abstract though, so let's see an actual example:

```js
const {StoreDSL, DomainObject, UserCredential, createStreamConnection} = require('event-store-stream');
const {ConcurrentFree: F, Utility, Async} = require('monadic-js');
const {when} = Utility;
const {throwE} = F.Control;

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
	
	applyEvent(event) {
		return event.case({
			ShoppingCartCreated: ({name}) => ({name, items: []}),
			ProductAdded: ({name, price}) => ({items: this.items.concat({name, price})}),
			Snapshot: (state) => state,
		});
	}
	
	addProduct(name, price) {
		return do StoreDSL {
			//perform your validations...
			do! when(this.items > 10, throwE(new Error("Too many items already...")))
			
			this.addEvent(new ProductAdded(name, price))
		};
	}
	
	snapshot() {
		return new Snapshot(this);
	}
}

//usage
const prog = do StoreDSL {
	cart <- ShoppingCart.create('my cart')
	//the cart gets updated, so we must bind
	//to a new cart -- not doing so will result
	//in an unexpected version error on the second add
	cart <- cart.addProduct('Cheese', 10)
	cart <- cart.addProduct('Milk', 11)
	//...
	return cart
};

const prog2 = cartID => do StoreDSL {
	cart <- ShoppingCart.load(cartID)
	cart.addProduct('Chocolate', 100)
};


const credentials = new UserCredentials("admin", "changeit");
const es = createStreamConnection({}, "tcp://localhost:1113");
es.connect();

const interpret = F.createInterpreter(
	Async,
	F.Control.interpreter,
	StoreDSL.interpreter(es, credentials, 100)
);

interpret(prog).fork(cart => console.log(cart), err => console.error(err))

```

Running the above script will create a new stream in the Event Store for the new shopping cart, add the creation event, and add the two product events. If you were to swap `prog` with `prog2('some-id')` in the `interpret` call and replace `some-id` with the id of this new cart and run it, you would add a new product to the same cart.

## Denormalizer
A denormalizer is used to creating read models from events stored in the event store in the CQRS+ES architecture. The denormalizer provided by this library makes this very easy, assuming your read model will be stored in a database supported by `transactional-db`.

Below is an example that maps the events from the shopping cart example above to a denormalized table in an RDBMS.

```js
const {Denormalizer, UserCredential, createStreamConnection} = require('event-store-stream');
const transactional = require('transactional-db');
const T = transactional.Transaction;
//const {ConcurrentFree: F, Utility, Async} = require('monadic-js');

//database manager with 10 connections to a MySQL server in its connection pool
const dbm = transactional.create('mysql', 10, {
	host: 'localhost',
	user: 'root',
	password: 'password',
	database: 'test'
});

//connection to the event store
const credentials = new UserCredentials("admin", "changeit");
const es = createStreamConnection({}, "tcp://localhost:1113");
es.credentials = credentials; //this will likely be made an explicit parameter to Denormalizer in the future
es.connect();

//note you can provide an optional IBus argument at the end
//where IBus is something with a publish method that takes an event
//name and event data
const denormalizer = new Denormalizer(dbm, es, 10, 100);

denormalizer.map('ShoppingCart.ShoppingCartCreated', ev => T.insert('shopping_cart', {
	id: ev.domainObjectId,
	name: ev.data.name,
	items: JSON.stringify([]),
}));

denormalizer.map('ShoppingCart.ProductAdded', ev => do T {
	cart <- T.read('shopping_cart', ev.domainObjectId)
	do! cart.case({
		Just: cart => do T {
			items = JSON.parse(items)
			items.push({
				name: ev.data.name,
				price: ev.data.price
			})
			
			do! T.update('shopping_cart', {
				id: ev.domainObjectId,
				items
			})
		},
		Nothing: T.of()
	})
});

denormalizer.start();
```

In a real world use case, you might also combine events from different domain objects into a single read model. You could also provide an event bus that conforms to the `IBus` interface and emit events in your queries with `T.emit`. This would allow you to provide clients with an API on top of your read model that pushes updated data to them, by subscribing your API service to the event bus.

## Effector
An effector is used to perform generic side effects in response to events that happen in a CQRS+ES architecture. The effector subscribes to live events and maps these to effects to execute, and executes them. Because only live events are subscribed to, you don't need to worry about the problem of repeating a side effect (sending the welcome email twice).

Right now I don't have an example for the Effector because I haven't written any DSLs to use with it yet. The interface is the same as Denormalizer though, other than the constructor.

## More info
Read [documentation.md](documentation.md) for an API reference.

Do not submit issues that are clearly part of `node-eventstore-client` here. Only submit issues related to the additional features provided by this package.

## Planned features
None right now, but I'm open to suggestions. Open an issue if you want something.

## Contributing
Contributions are welcome. Currently just follow the standard fork-commit-push-pull request model. If this gets attention and people want to collaborate I will start an organization for this and we can start coming up with actual guidelines for style and contribution.
