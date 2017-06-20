var client = require('../src/index.js');
var streamName = "testStream";

function print(stream$) {
	stream$.filter(e => e.eventStreamId.startsWith('testStream')).forEach(x => console.log(x));
}

const credentials = new client.UserCredentials("admin", "changeit")

const connSettings = {};  // Use defaults
const connection = client.createStreamConnection(connSettings, "tcp://localhost:1113");
connection.connect();
connection.once('connected', function (tcpEndPoint) {
	const stream$ = connection.stream$(streamName, false, credentials, 1);
	const streamFrom$ = connection.streamFrom$(streamName, 0, false, credentials, 1);
	const all$ = connection.all$(false, credentials, 1);
	const allFrom$ = connection.allFrom$(null, false, credentials, 1);

	print(all$);
});