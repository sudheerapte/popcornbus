"use strict";

/*
  client-wrangler.js - keep clients happy and track them

  See README.txt
*/

const EventEmitter = require('events');
const fs = require('fs');
const SSEventEmitter = require('./sse.js');

class ClientWrangler extends EventEmitter {

  constructor() {
    super();
  }

  newClient(sock) {
    const emitter = new SSEventEmitter();
    sock.on('end', () => {
      this.emit('disconnect', emitter);
      // no need to close the socket again
      // this.dropClient(sock, emitter);
    });
    sock.on('error', (eMsg) => {
      log(`dropping socket on error: ${eMsg}`);
      this.dropClient(sock, emitter);
    });
    emitter.setWriteStream(sock);
    emitter.once('SSEvent', e => {
      this.processFirstClientEvent(emitter, sock, e);
    });
    emitter.readFrom(sock);
    return emitter;
  }

  dropClient(sock, emitter) {
    this.emit('disconnect', emitter);
    if (sock) {
      sock.end();
      log(`closing socket`);
    }
  }

  processFirstClientEvent(emitter, sock, e) {
    let msg;
    switch (e.type) {
    case 'appConnect':
      this.emit('appConnect', {
	lines: e.data,
	sse: emitter,
	dropConnection: () => this.dropClient(sock, emitter),
      });
      break;
    case 'fireAndForget':
      this.emit('fireAndForget', e.data);
      setImmediate( () => sock.end() );
      break;
    case 'oneShotCommand':
      const arg = {
	lines: e.data,
	sendSuccess: (details, cb) => {
	  if (sock) {
	    sock.end(`event: replySuccessrndata: ${details}rnrn`, () => {
	      if (cb) { return cb(null); }
	    });
	  } else {
	    if (cb) { return cb("sendSuccess: socket already closed"); }
	  }
	},
	sendError: (msg, cb) => {
	  if (sock) {
	    sock.end(`event: replyErrorrndata: ${msg}rnrn`, () => {
	      if (cb) { return cb(null); }
	    });
	  } else {
	    if (cb) { return cb("sendError: socket already closed"); }
	  }
	},
      };
      this.emit('oneShotCommand', arg);
      break;
    default:
      log(`bad first event: |${e.type}|`);
      this.dropClient(sock, emitter);
    }
  }
}

function log(str) {
  if (! process.env["DEBUG"]) { return; }
  const d = new Date();
  console.log(`[${d.toISOString()}] INFO client-wrangler: ${str}`);
}

module.exports = new ClientWrangler;
