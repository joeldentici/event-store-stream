const defaults = require('transactional-db').Test;
const Long = require('long');
const client = require('node-eventstore-client');


/* Mock subscription */
class Subscription {
	constructor(onEvent, onDone, onLive) {
		this.onEvent = onEvent;
		this.onDone = onDone;
		this.onLive = onLive;
		this.live = false;
	}

	push(event, live = true) {
		if (live && this.onLive && !this.live) {
			this.live = true;
			this.onLive();
		}

		if (!this.stopped && (live || this.onLive)) {
			this.onEvent(null, event);
		}
	}

	pushOld(events) {
		events.forEach(event => this.push(event, false));
	}

	stop() {
		this.stopped = true;
		this.onDone();
	}
}

/* Mock transaction */
class Transaction {
	constructor(conn, sid) {
		this.conn = conn;
		this.sid = sid;
		this.tape = [];
	}

	write(events) {
		events = events instanceof Array ? events : [events];
		events = events.map(event => this.conn.eventAdapter(event));
		this.tape = this.tape.concat(events);
		return Promise.resolve();
	}

	commit() {
		if (!this.conn.events[this.sid]) {
			this.conn.events[this.sid] = [];
		}

		this.tape.forEach(event => this.conn.notify(this.sid, event));

		//good for catch ups
		this.tape.forEach(event => this.conn.events[this.sid].push(event));
		return Promise.resolve();
	}


}

/* Mock connection */
class Connection {
	constructor(eventAdapter = (x => x)) {
		this.subscriptions = {};
		this.all = [];
		this.events = {};
		this.eventAdapter = eventAdapter;
	}

	notify(sid, event) {
		//live notifications for each subscription
		(this.subscriptions[sid] || []).forEach(sub => sub.push(event));

		this.all.forEach(sub => sub.push(event));
	}

	subscribeToStream(sid, links, onEvent, onDone, userCredentials) {
		if (!this.subscriptions[sid]) {
			this.subscriptions[sid] = [];
		}

		const s = new Subscription(onEvent, onDone);
		this.subscriptions[sid].push(s);

		return Promise.resolve(s);
	}

	subscribeToStreamFrom(sid, pos, links, onEvent, onLive, onDone, credentials, batch) {
		pos = pos || 0;

		if (!this.subscriptions[sid]) {
			this.subscriptions[sid] = [];
		}

		const s = new Subscription(onEvent, onDone, onLive);
		this.subscriptions[sid].push(s);

		setTimeout(() => {
			const events = (this.events[sid] || []).slice(pos);
			events.forEach(event => s.push(event, false));
			onLive();
			s.live = true;
		}, 100)

		return s;
	}

	subscribeToAll(links, onEvent, onDone, credentials) {
		const s = new Subscription(onEvent, onDone);
		this.all.push(s);

		return Promise.resolve(s);
	}

	subscribeToAllFrom(pos, links, onEvent, onLive, onDone, credentials, batch) {
		const s = new Subscription(onEvent, onDone, onLive);
		this.all.push(s);

		setImmediate(() => {
			const events = Object.keys(this.events).map(k => this.events[k]);
			const all = [].concat(...events);

			all.forEach(event => s.push(event, false));
		});

		return s;
	}

	startTransaction(sid, version, credentials) {
		return Promise.resolve(new Transaction(this, sid));
	}

	readStreamEventsForward(sid, start, count, b, credentials) {
		const res = (this.events[sid] || []).slice(start).slice(0, count);

		return Promise.resolve({events: res});
	}

	readStreamEventsBackward(sid, start, count, b, credentials) {
		function get(events, start, end) {
			events = start > 0 ? events : [].concat(events).reverse();

			start = start > 0 ? start : start * -1 - 1;

			return events.slice(start, start + end);	
		}

		const res = get(this.events[sid] || [], start, count);

		return Promise.resolve({events: res});
	}
}

function makeEvent(type, data) {
	return {
		originalEvent: {
			eventType: type,
			data: JSON.stringify(data),
			isJson: true,
		},
		originalPosition: new client.Position(
			new Long(0, 0),
			new Long(0, 0)
		)
	};
}

function wrapEvent(event) {
	return {
		originalEvent: Object.assign({}, event, {
			eventType: event.type,
			eventNumber: 0
		}),
		originalPosition: new client.Position(
			new Long(0, 0),
			new Long(0, 0)
		)
	}
};

function writeEvent(conn, stream, type, data) {
	const event = makeEvent(type, data);
	return conn.startTransaction(stream, 0, null)
		.then(trans =>
			trans.write(event)
				 .then(_ => trans.commit())
		);
}

module.exports = Object.assign({}, defaults, {
	Connection,
	makeEvent,
	writeEvent,
	wrapEvent
});