"use strict";

const clientWrangler = require('../client-wrangler.js');
const Stream = require('stream');
const EventEmitter = require('events');
const SSE = require('../sse.js');

let DEBUG;

function log(s) {
  if (DEBUG) {
    console.log(s);
  }
}

function err(s) {
  console.log(s);
  process.exit(1);
}

DEBUG=process.env["DEBUG"];

/**
   @class(OneShotClient) - constructor takes test and sets 
   "oneShotReplyReceived" to true iff it gets a reply.
*/
class OneShotClient {
  constructor(aTest) {
    this._stream = new Stream.Duplex({
      read(size) {
	if (! this._spent) {
	  log("client sending oneShotCommand")
	  this.push("event: oneShotCommand\ndata: foo = bar\n\n");
	  this.push(null);
	  this._spent = true;
	}
      },
      write(chunk, encoding, cb) {
	const m = (""+chunk).match(/^event:\s*([^\s]+)/);
	if (m) {
	  log(`oneShot client reply ${m[1]} - matched`);
	  aTest.oneShotReplyReceived = true;
	} else {
	  log(`oneShot client - reply chunk did not match`);
	}
	return cb();
      }
    });
  }
}

class OneShotTest extends EventEmitter {
  constructor(aClient) { super(); this._client = aClient; }
  run(next) {
    log("----------------- one-shot client sends foo=bar");
    clientWrangler.once('oneShotCommand', rec => {
      log(`OneShotTest: got oneShotCommand |${rec.lines}|`);
      this.oneShotEventTriggered = true;
      let successSent = rec.sendSuccess('got foo', (eMsg) => {
	log(`successSent successful`); 
	return next();
      });
    });
    const client = new OneShotClient(this);
    clientWrangler.newClient(client._stream);
  }
  beforeExitCheck() {
    if (!this.oneShotEventTriggered) {
      err(`oneShotEvent was never triggered!`);
    }
    if (!this.oneShotReplyReceived) {
      err(`oneShotReply was never received!`);
    }
  }
}

class FFTest extends EventEmitter {
  constructor() { super(); }
  run(next) {
    log("-----------------ff client sends foo=bar");
    clientWrangler.once('fireAndForget', lines => {
      log(`ffTest: got ff command |${lines}|`);
      this.gotff = true;
      if (! lines.match(/foo.*bar/)) {
	err(`fireAndForget payload was not foo = bar! Got |${lines}|`);
      }
      return next();
    });
    const client = new Stream.Duplex({
      read(size) {
	if (! this._spent) {
	  log("client sending ff")
	  this.push("event: fireAndForget\ndata: foo = bar\n\n");
	  this.push(null);
	  this._spent = true;
	}
      },
      write(chunk, encoding, cb) {
	log("ff client got: |"+chunk+"|");
	return cb();
      }
    });
    clientWrangler.newClient(client);
  }
  beforeExitCheck() {
    if (!this.gotff) {
      err(`fireAndForget was never triggered!`);
    }
  }
}

/**
   @class(FFHangTest) - do not hang up after sending FF command
*/
class FFHangTest extends EventEmitter {
  constructor() { super(); }
  run(next) {
    log("-----------------ff hang client sends foo=bar");
    const me = this;
    clientWrangler.once('fireAndForget', lines => {
      log(`ffTest: got ff command |${lines}|`);
      this.gotff = true;
      if (! lines.match(/foo.*bar/)) {
	err(`fireAndForget payload was not foo = bar! Got |${lines}|`);
      }
      return next();
    });
    const client = new Stream.Duplex({
      read(size) {
	if (! this._spent) {
	  log("client sending ff")
	  this.push("event: fireAndForget\ndata: foo = bar\n\n");
	  this._spent = true;
	}
      },
      write(chunk, encoding, cb) {
	log("ff client got: |"+chunk+"|");
	return cb();
      }
    });
    client.on('end', () => { me._ended = true; });
    clientWrangler.newClient(client);
  }
  beforeExitCheck() {
    if (!this.gotff) {
      err(`Ffhangtest: fireAndForget was never triggered!`);
    }
    if (!this._ended) {
      err(`Ffhangtest: client socket was never closed!`);
    }
  }
}


/**
   AppTest: implement this protocol, client >> server:
     >> appConnect ping
         << pong pongdata
     >> pang pangdata
         << <disconnect>

   Uses an instance of AppClient defined below.
*/
class AppTest extends EventEmitter {
  constructor(appClient) {
    super();
    this._appClient = appClient;
  }
  run(next) {
    let me = this;
    clientWrangler.once('appConnect', rec => {
      log(`appTest: got appConnect command |${rec.lines}|`);
      this.gotAppConnect = true;
      if (! rec.lines.match(/ping/)) {
	err(`fireAndForget payload was not ping! Got |${rec.lines}|`);
      }
      rec.sse.on('SSEvent', e => {
	if (e.type.match(/^pang/)) {
	  this.gotPang = true;
	  log(`appServer got pang |${e.data.trim()}|`);
	  log(`appServer disconnecting client.`);
	  rec.dropConnection();
	  next();
	} else {
	  err(`appServer: expecting pang, got ${e.type}`);
	}
      });
      setImmediate( () => {
	log(`appTest: sending pong`);
	rec.sse.sendEvent({ type: 'pong', data: 'pongdata' });
      });

      setTimeout( () => waitForPang(next), 200 );

      function waitForPang(cb) { // cb only if not got pang
	if (! me.gotPang) {
	  log(`appServer timed out pang. Disconnecting client`);
	  rec.dropConnection();
	  cb();
	}
      }
    });
    
    clientWrangler.newClient(this._appClient.getDuplexStream());
    this._appClient.doIt();
  }
  beforeExitCheck() {
    if (!this.gotAppConnect) {
      err(`appConnect was never triggered!`);
    }
  }
}

/**
   @class(AppClient) - provide a duplex stream with built-in behavior

   See ping-pong-pang protocol description above.

   We start the process with a fake "start\n" string.
*/

class AppClient {
  constructor() {
    let me = this;
    this._t = new Stream.Transform({
      transform(chunk, encoding, cb) {
	me.processWrite(chunk, encoding, cb);
      }
    });
  }

  doIt() {
    this._t.write("start\n");
  }

  processWrite(chunk, encoding, cb) {
    const data = ""+chunk;
    if (data.match(/^start/)) {
      if (! this._pingSent) {
	log(`client sending appConnect with ping`);
	this._t.push("event: appConnect\ndata: ping\n\n");
	this._pingSent = true;
	cb();
      } else {
	err(`start called but ping already sent`);
      }
    } else if (data.match(/^event.*pong/)) {
      if (! this._pingSent) { err("pong before ping sent!"); }
      if (this._pangSent) { err("pong after pang sent!"); }
      log(`client got pong. Sending pang`);
      this._t.push("event: pang\ndata: pangdata\n\n");
      this._pangSent = true;
      cb();
    } else {
      err(`client got bad event: ${data}`);
    }
  }

  getDuplexStream() {
    return this._t;
  }
}

let oneShotTest = new OneShotTest();
let ffTest = new FFTest();
let ffHangTest = new FFHangTest();
let appClient = new AppClient();
let appTest = new AppTest(appClient);

function runOneShotTests(next) {
  oneShotTest.run( () => {
    ffTest.run( () => {
      ffHangTest.run( () => {
	appTest.run(next);
      });
    });
  });
}

/**
   The hanging client test 1 - client never sends a pang
   The server times it out after 200 ms of inactivity.

   @class(HangingClient) - never send the pang
*/

class HangingClient1 {
  constructor() {
    let me = this;
    this._t = new Stream.Transform({
      transform(chunk, encoding, cb) {
	me.processWrite(chunk, encoding, cb);
      }
    });
    this._t.on('end', () => {
      this._closed = true;
    });
    process.on('beforeExit', code => {
      if (code === 0) {
	if (! this._closed) {
	  err("HangingClient1 was never closed!");
	}
      }
    });
  }
  doIt() {
    log("HangingClient1 starting.");
    this._t.write("start\n");
  }
  processWrite(chunk, encoding, cb) {
    const data = ""+chunk;
    if (data.match(/^start/)) {
      if (! this._pingSent) {
	log(`client sending appConnect with ping`);
	this._t.push("event: appConnect\ndata: ping\n\n");
	this._pingSent = true;
	cb();
      } else {
	err(`start called but ping already sent`);
      }
    } else if (data.match(/^event.*pong/)) {
      if (! this._pingSent) { err("pong before ping sent!"); }
      if (this._pangSent) { err("pong after pang sent!"); }
      log(`client got pong. NOT sending pang`);
      cb();
    } else {
      err(`client got bad event: ${data}`);
    }
  }
  getDuplexStream() {
    return this._t;
  }
}

let hangingClient1Test = new AppTest(new HangingClient1());
let hangingClient1Completed;

/**
   The hanging client test 2 - client never waits for pong
   The server will fail to time it out, because the protocol
   is not yet over.

   @class(HangingClient2) - never wait for pong
*/

class HangingClient2 {
  constructor() {
    let me = this;
    this._t = new Stream.Transform({
      transform(chunk, encoding, cb) {
	me.processWrite(chunk, encoding, cb);
      }
    });
    this._t.on('end', () => {
      log(`h2 got end.`);
      this._closed = true;
    });
    process.on('beforeExit', code => {
      if (code === 0) {
	if (this._closed) {
	  err("HangingClient2 was closed!");
	}
      }
    });
  }
  doIt() {
    log("HangingClient2 starting.");
    this._t.write("start\n");
  }
  processWrite(chunk, encoding, cb) {
    const data = ""+chunk;
    if (data.match(/^start/)) {
      if (! this._pingSent) {
	log(`hanging client2 sending appConnect with ping`);
	this._t.push("event: appConnect\ndata: ping\n\n");
	this._pingSent = true;
	log(`will hang now and not look for pong`);
	cb();
      } else {
	err(`start called but ping already sent`);
      }
    } else {
      log(`client ignoring event: ${data}`);
    }
  }
  getDuplexStream() {
    return this._t;
  }
}

let hangingClient2Test = new AppTest(new HangingClient2());
let hangingClient2Completed;

function runErrorTests(next) {
  hangingClient1Test.run( () => {
    hangingClient1Completed = true;
    hangingClient2Test.run( () => {
      hangingClient2Completed = true;
      next();
    });
  });
}

runOneShotTests( () => {
  runErrorTests( () => log("done") );
});

process.on('beforeExit', code => {
  if (code === 0) {
    oneShotTest.beforeExitCheck();
    ffTest.beforeExitCheck();
    if (! hangingClient1Completed) {
      err(`hangingClient1Test never completed!`);
    }
    if (! hangingClient2Completed) {
      err(`hangingClient2Test never completed!`);
    }
  }
});

