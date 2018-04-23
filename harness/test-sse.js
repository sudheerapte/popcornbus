const SSEventEmitter = require('../sse.js');

function log(s) {
  if (process.env["DEBUG"]) {
    console.log(s);
  }
}

function err(s) {
  console.log(s);
}

function linesToEventObject() { // convert text to a message
  const emitter = new SSEventEmitter();

  const testLines = [
    "event: update\n",
    "data: foo = bar\n",
    "data: baz = bat\n",
    "\n",
  ];

  const resultUpdate =  {foo: "bar", baz: "bat"};

  emitter.on('SSEvent', e => {
    switch (e.type) {
    case 'message': log(`message event! ${JSON.stringify(e)}`); break;
    case 'update':
      const result = parseUpdate(e.data);
      if (JSON.stringify(result) == JSON.stringify(resultUpdate)) {
        process.exit(0);
      } else {
        err(`${JSON.stringify(result)} DID NOT MATCH:\n` +
            `${JSON.stringify(resultUpdate)}`);
        process.exit(1);
      }
      break;
    default: process.exit(1); break;
    }
    process.exit(0);
  });

  function parseUpdate(data) {
    let obj = {};
    (""+data).split(/\n|\r\n/).forEach( line => {
      const m = line.trim().match(/^(\w+)\s*\=\s*(\w+)$/);
      if (! m) {
        process.exit(2);
      } else {
        obj[m[1]] = m[2];
      }
    });
    return obj;
  }

  const Stream = require('stream');
  const readable = new Stream.Readable();
  emitter.readFrom(readable);
  testLines.forEach( line => readable.push(line) );
  readable.push(null);
}

function pingPong() {  // send event, and send it back with updated counter
  const ping = new SSEventEmitter();

  let anEvent = { type: "pingpong", data: "0\n0\n0\n" };
  const turns = 4; // how many times to ping-pong

  const startMilli = new Date();

  const pong = new SSEventEmitter();
  pong.on('SSEvent', e => {
    // log(`pong got ${JSON.stringify(e)}`);
    if (e.type === "pingpong") {
      let i = parseInt(e.data, 10);
      if (i < turns) {
        i++;
        pong.sendEvent({type: "pingpong", data: `${i}`});
      } else {
	gameOver();
      }
    }
  });

  ping.on('SSEvent', e => {
    //log(`ping got ${JSON.stringify(e)}`);
    if (e.type === "pingpong") {
      let i = parseInt(e.data, 10);
      if (i < turns) {
        i++;
        ping.sendEvent({type: "pingpong", data: `${i}`});
      } else {
	gameOver();
      }
    }
  });

  const Stream = require('stream');
  const pingToPong = new Stream.PassThrough();
  pong.readFrom(pingToPong);
  ping.setWriteStream(pingToPong);
  const pongToPing = new Stream.PassThrough();
  ping.readFrom(pongToPing);
  pong.setWriteStream(pongToPing);

  log(`ping sending ${JSON.stringify(anEvent)}`);
  ping.sendEvent(anEvent);

  function gameOver() {
    const endMilli = new Date();
    log(`milli = ${endMilli - startMilli}`);
  }
}

linesToEventObject();
pingPong();
