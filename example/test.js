var client = require('../src/index.js');
var streamName = "testStream";

function print(stream$) {
	stream$
		.filter(e => e.eventStreamId.startsWith('testStream'))
		//.toPromise()
		//.then(x => console.log(x),e => console.error(e));
		.forEach(x => console.log(x));
}

const credentials = new client.UserCredentials("admin", "changeit")

const connSettings = {};  // Use defaults
const connection = client.createStreamConnection(connSettings, "tcp://localhost:1113");
connection.connect();
connection.once('connected', function (tcpEndPoint) {
	const stream$ = connection.stream$(streamName, false, credentials);
	const streamFrom$ = connection.streamFrom$(streamName, 0, false, credentials, 1, true);
	const all$ = connection.all$(false, credentials);
	const allFrom$ = connection.allFrom$(null, false, credentials, 1, true);

	print(allFrom$);
});