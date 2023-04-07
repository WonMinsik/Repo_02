const EventEmitter = require('events');
const util = require('util');

function Emitter() {
  EventEmitter.call(this);
}

util.inherits(Emitter, EventEmitter);

const ServerEventEmitter = new Emitter();

module.exports = ServerEventEmitter;
