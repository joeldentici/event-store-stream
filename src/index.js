const esClient = require('node-eventstore-client');
const StreamConnection = require('./connection.js');

/**
 *	event-store-stream
 *	written by Joel Dentici
 *	on 6/19/2017
 *
 *	Wraps the node-eventstore-client to
 *	provide RxJS Observables (event streams)
 *	of subscriptions, in addition to having
 *	a callback based version.
 *
 *	The methods from the node-eventstore-client
 *	connection are dispatched to automatically,
 *	so this can be used in place of it directly.
 */

/**
 *	createStreamConnection :: Object -> string -> StreamConnection
 *
 *	Creates a connection to the event store that supports creating
 *	RxJS Observable streams of subscriptions.
 */
function createStreamConnection(settings, connString) {
	const esConnection = esClient.createConnection(settings, connString);

	return new Proxy(esConnection, StreamConnection);
}

module.exports = esClient;
module.exports.createStreamConnection = createStreamConnection;
module.exports.Denormalizer = require('./denormalizer.js');