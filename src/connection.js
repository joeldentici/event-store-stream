const Rx = require('rx');
const {simplifyEvent} = require('./util.js');
const {Async} = require('monadic-js');

/**
 *	event-store-stream.StreamConnection
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
	//automatically parse the JSON data (if it is JSON)
	//and only return the originalEvent
	.map(simplifyEvent)
	.share();
}


const methods = {
	/**
	 *	stream$ :: StreamConnection -> string -> bool -> UserCredentials -> Observable Event
	 *
	 *	Returns an Observable of the requested event stream.
	 */
	stream$(conn) {
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
	/**
	 *	streamFrom$ :: StreamConnection -> string -> int -> bool -> UserCredentials -> int -> bool -> Observable Event
	 *
	 *	Returns an Observable of the requested event stream. This stream starts at
	 *	the desired position, loads all events from there up in batchSize increments,
	 *	and then finally subscribes to the live stream once all old events are processed.
	 *
	 *	If the final parameter is true, then the resulting Observable will complete after catching up
	 *	to the latest event. This can be used with an initial aggregate and reduce to apply events to an
	 *	aggregate.
	 *
	 *	If the final parameter is false, then the subscription is kept open and the Observable will receive
	 *	live events.
	 */
	streamFrom$(conn) {
		return function(stream, lastCheckPoint, resolveLinkTos, userCredentials, batchSize, endAfterCatchUp = false) {
			return createStream(function(observer) {
				return Promise.resolve(conn.subscribeToStreamFrom(
					stream,
					lastCheckPoint,
					resolveLinkTos,
					(s,e) => observer.onNext(e),
					endAfterCatchUp ? observer.onCompleted.bind(observer) : x => x,
					observer.onCompleted.bind(observer),
					userCredentials,
					batchSize));
			});
		}
	},
	/**
	 *	all$ :: StreamConnection -> bool -> UserCredentials -> Observable Event
	 *
	 *	Returns an Observable of all event streams.
	 */
	all$(conn) {
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
	/**
	 *	allFrom$ :: StreamConnection -> Position -> bool -> UserCredentials -> int -> bool -> Observable Event
	 *
	 *	Returns an Observable of all event streams. This stream starts at
	 *	the desired position, loads all events from there up in batchSize increments,
	 *	and then finally subscribes to the live stream once all old events are processed.
	 *
	 *	If the final parameter is true, then the resulting Observable will complete after catching up
	 *	to the latest event. This can be used with an initial aggregate and reduce to apply events to an
	 *	aggregate.
	 *
	 *	If the final parameter is false, then the subscription is kept open and the Observable will receive
	 *	live events.
	 */
	allFrom$(conn) {
		return function(lastCheckPoint, resolveLinkTos, userCredentials, batchSize, endAfterCatchUp = false) {
			return createStream(function(observer) {
				return Promise.resolve(conn.subscribeToAllFrom(
					lastCheckPoint,
					resolveLinkTos,
					(s,e) => observer.onNext(e),
					endAfterCatchUp ? observer.onCompleted.bind(observer) : x => x,
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

			return (...args) => {
				//defer this as there are side effects
				return Async.create((succ, fail) => {
					succ(methods[prop](obj)(...args));
				});				
			}

		}

		return obj[prop];
	}
}

module.exports = StreamConnection;