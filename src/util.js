
/**
 *	event-store-stream.util
 *	written by Joel Dentici
 *	on 6/29/2017
 *
 *	Utility functions used internally.
 */

/**
 *	simplifyEvent :: ResolvedEvent -> Event
 *
 *	Simplifies the event object from the one returned
 *	by the Event Store.
 */
exports.simplifyEvent = function(event) {
	if (event.originalEvent.isJson) {
		return Object.assign({}, event.originalEvent, {
			data: JSON.parse(event.originalEvent.data.toString()),
			position: event.originalPosition,
		});
	}
	else {
		return Object.assign({}, event.originalEvent, {
			position: event.originalPosition
		});
	}
}

/**
 *	addDomainInfo :: Event -> DomainObjectEvent
 *
 *	Adds information about the domain object that
 *	an event is tied to.
 */
const addDomainInfo = exports.addDomainInfo = function(event) {
	const streamId = event.eventStreamId;
	const sepAt = streamId.indexOf('-');
	const domainObjectType = streamId.substring(0, sepAt);
	const domainObjectId = streamId.substring(sepAt + 1);

	return Object.assign({}, event, {
		domainObjectType,
		domainObjectId
	});
}

/**
 *	interested :: [string] -> Event -> bool
 *
 *	Creates a filter predicate for the specified event types
 */
const interested = exports.interested = function(eventTypes) {
	const types = new Set(eventTypes);
	return function(event) {
		return types.has(event.eventType);
	}
}

/**
 *	getInterestingEvents :: (Observable Event, [string], int) -> Observable [Event]
 *
 *	Map an event stream to a stream of event windows, containing events
 *	of the specified types. Windows are buffered for the provided throttle
 *	time.
 */
exports.getInterestingEvents = function(stream$, types, throttle) {
	return stream$
			.filter(interested(types))
			.map(addDomainInfo)
			.buffer(Rx.Observable.interval(throttle))
			.filter(x => x.length)
}