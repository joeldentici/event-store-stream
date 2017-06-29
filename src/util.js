
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