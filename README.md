# event-store-stream
This package adds 4 new methods to the event store connection from `node-eventstore-client`.

See [documentation.html](documentation.html) for a reference on these methods.

## install
Run `npm install --save event-store-stream` to use this package in your project.

## example
Try running the two applications below side-by-side to see this working.

Running the application below will load the stream as an observable and then log each event to the console that occurs on it.
```
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
```
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
