const E = require('../esl');
const Async = require('monadic-js').Async;
const {doM} = require('monadic-js').Utility;
const CaseClass = require('js-helpers').CaseClass;
const uuid = require('uuid');
const client = require('node-eventstore-client');

class DomainObject {
	/**
	 *	new :: UUID -> int -> Object -> DomainObject
	 *
	 *	Constructs a new DomainObject instance
	 */
	constructor(id, version, options) {
		for (let k of Object.keys(options)) {
			this[k] = options[k];
		}

		this.id = id;
		this.version = version;
	}

	/**
	 *	create :: ...any -> EventStoreDSL Error DomainObject
	 *
	 *	Creates a new instance of the domain object.
	 */
	static create(...args) {
		const obj = new this(uuid.v4(), -1, {});

		return obj.addEvent(this.doCreate(...args));
	}

	/**
	 *	load :: UUID -> EventStoreDSL Error DomainObject
	 *
	 *	Loads the domain object with the specified id.
	 */
	static load(id, loadVersion = Infinity) {
		const self = this;

		//our streams 
		const typeName = this.prototype.constructor.name;
		const streamId = typeName + '-' + id;
		const snapshotStreamId = 'snapshot-' + streamId;

		let initialState = new this(id, -1, {});
		let startPosition = null;
		return doM(function*() {
			//if there is a snapshot, then change starting position
			const snapshot = yield E.readEvent(snapshotStreamId, -1);
			if (snapshot) {
				startPosition = snapshot.data.position;
			}

			//get events from the object's event stream
			const events$ = (yield E.readFromStream(streamId, startPosition))
				.filter(event => event.eventNumber < loadVersion);

			//reconstitute the object state from the events
			const loadObj = Async.await(
				events$
					.map(event => 
						[event, toDomainEvent(typeName, event.eventType, event.data)])
					.reduce(
						(state, [oev, ev]) => state._applyEvent(ev, oev.eventNumber),
						initialState)
					.toPromise()
			);

			//count the number of events we applied
			const loadNumEvents = Async.await(
				events$
					.map(ev => 1)
					.reduce((n,a) => n + a, 0)
					.toPromise()
			);

			const [obj, numEvents] = yield Async.all(loadObj, loadNumEvents);

			//determine whether to snapshot
			if (numEvents >= self.SNAPSHOT_AFTER) {
				return obj.snapshot();
			}
			else {
				return E.unit(obj);
			}
		});
	}

	/**
	 *	addEvent :: DomainObject -> Event -> bool -> EventStoreDSL Error DomainObject
	 *
	 *	Adds an event to the domain object.
	 */
	addEvent(event, snapshot = false) {
		const typeName = this.constructor.name;
		const streamId = typeName + '-' + this.id;
		const snapshotStreamId = 'snapshot-' + streamId;

		//we will store eventData to streamId
		const eventData = toStorableEvent(typeName, event);

		//we will apply domainEvent with eventNumber to our self
		const domainEvent = new DomainEvent(event.constructor.name, event);
		const newVersion = this.version + 1;

		const self = this;

		return doM(function*() {
			yield E.appendToStream(streamId, eventData);

			//store snapshot position if we are storing a snapshot
			if (snapshot) {
				yield E.appendToStream(
					snapshotStreamId, 
					toStorableEvent(typeName, {position: self.version})
				);
			}

			return E.unit(self._applyEvent(domainEvent, newVersion));
		});
	}

	/**
	 *	_applyEvent :: DomainObject -> DomainEvent -> int -> DomainObject
	 *
	 *	Returns a new instance of this type representing the same domain
	 *	object in the state arrived at by applying the provided event.
	 */
	_applyEvent(event, version) {
		const changes = this.applyEvent(event);

		const options = Object.assign({}, this, changes);

		return new this.constructor(this.id, version, options);
	}

	/**
	 *	applyEvent :: DomainObject -> DomainEvent -> Object
	 *
	 *	Returns changes to apply to this object in response to
	 *	an event.
	 */
	applyEvent(event) {
		return {};
	}

	/**
	 *	snapshot :: DomainObject -> () -> EventStoreDSL Error DomainObject
	 *
	 *	Takes a snapshot of the current domain object state.
	 */
	snapshot() {
		const event = this.doSnapshot();

		return this.addEvent(event, true);
	}
}

DomainObject.SNAPSHOT_AFTER = 1000;

module.exports = DomainObject;

class DomainEvent extends CaseClass {
	constructor(type, data) {
		super(type);

		for (let k of Object.keys(data)) {
			this[k] = data[k];
		}
	}

	doCase(fn) {
		return fn(this);
	}
}

function toStorableEvent(typeName, eventData) {
	//simulate namespaces for event types when they are stored
	const eventType = typeName + '.' + eventData.constructor.name;
	const eventId = uuid.v4();
	const event = client.createJsonEventData(eventId, 
		eventData, null, eventType);

	return event;
}

function toDomainEvent(className, eventType, eventData) {
	//remove the simulated namespace
	const type = eventType.substring(className.length + 1);
	return new DomainEvent(type, eventData);
}