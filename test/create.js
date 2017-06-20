var esClient = require('../src/index.js');
var uuid = require('uuid');

var streamName = "testStream";
/* 
  Connecting to a single node using "tcp://localhost:1113"
  - to connect to a cluster via dns discovery use "discover://my.host:2113"
  - to connect to a cluster via gossip seeds use 
  [
    new esClient.GossipSeed({host: '192.168.1.10', port: 2113}), 
    new esClient.GossipSeed({host: '192.168.1.11', port: 2113}), 
    new esClient.GossipSeed({host: '192.168.1.12', port: 2113})
  ]
*/
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