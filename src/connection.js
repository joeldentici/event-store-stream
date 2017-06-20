const Rx = require('rx');

/**
 *	StreamConnection
 *	written by Joel Dentici
 *	on 6/19/2017
 *
 *	Adds methods to the event store connection
 *	to create RxJS Observable streams for stream
 *	subscriptions.
 */

/**
 *	createStream :: (Observer -> Promise Subscription Error) -> Observable Event Error
 *
 *	Create an RxJS Observable stream from subscription. This handles disposal of
 *	the subscription on Observable disposal and errors with subscription.
 */
function createStream(cb) {
	return Rx.Observable.create(function(observer) {
		const res = cb(observer);

		//if error occurs subscribing, observable should
		//propagate it
		res.catch(function(err) {
			observer.onError(err);
		});

		//if the observable subscription is disposed,
		//then we should dispose the stream subscription
		return function() {
			res.then(sub => sub.stop());
		}
	})
	.share()
	//automatically parse the JSON data (if it is JSON)
	//and only return the originalEvent
	.map(event => {
		if (event.originalEvent.isJson) {
			return Object.assign({}, event.originalEvent, {
				data: JSON.parse(event.originalEvent.data.toString())
			});
		}
		else {
			return event.originalEvent;
		}
	});

}


const methods = {
	stream$(conn) {
		/**
		 *	stream$ :: string -> bool -> UserCredentials -> Observable Event
		 *
		 *	Returns an Observable of the requested event stream.
		 */
		return function(stream, resolveLinkTos, userCredentials) {
			return createStream(function(observer) {
				return conn.subscribeToStream(
					stream,
					resolveLinkTos,
					(s,e) => observer.onNext(e),
					observer.onCompleted.bind(observer),
					userCredentials);
			});
		}
	},
	streamFrom$(conn) {
		/**
		 *	streamFrom$ :: string -> int -> bool -> UserCredentials -> int -> Observable Event
		 *
		 *	Returns an Observable of the requested event stream. This stream starts at
		 *	the desired position, loads all events from there up in batchSize increments,
		 *	and then finally subscribes to the live stream once all old events are processed.
		 */
		return function(stream, lastCheckPoint, resolveLinkTos, userCredentials, batchSize) {
			return createStream(function(observer) {
				return Promise.resolve(conn.subscribeToStreamFrom(
					stream,
					lastCheckPoint,
					resolveLinkTos,
					(s,e) => observer.onNext(e),
					x => x,
					observer.onCompleted.bind(observer),
					userCredentials,
					batchSize));
			});
		}
	},
	all$(conn) {
		/**
		 *	all$ :: bool -> UserCredentials -> Observable Event
		 *
		 *	Returns an Observable of all event streams.
		 */
		return function(resolveLinkTos, userCredentials) {
			return createStream(function(observer) {
				return conn.subscribeToAll(
					resolveLinkTos,
					(s,e) => observer.onNext(e),
					observer.onCompleted.bind(observer),
					userCredentials);
			});
		}
	},
	allFrom$(conn) {
		/**
		 *	allFrom$ :: Position -> bool -> UserCredentials -> int -> Observable Event
		 *
		 *	Returns an Observable of all event streams. This stream starts at
		 *	the desired position, loads all events from there up in batchSize increments,
		 *	and then finally subscribes to the live stream once all old events are processed.
		 */
		return function(lastCheckPoint, resolveLinkTos, userCredentials, batchSize) {
			return createStream(function(observer) {
				return Promise.resolve(conn.subscribeToAllFrom(
					lastCheckPoint,
					resolveLinkTos,
					(s,e) => observer.onNext(e),
					x => x,
					observer.onCompleted.bind(observer),
					userCredentials,
					batchSize));
			});
		}
	}
}

const StreamConnection = {
	get(obj, prop) {
		if (methods[prop]) {
			return methods[prop](obj);
		}

		return obj[prop];
	}
}

module.exports = StreamConnection;