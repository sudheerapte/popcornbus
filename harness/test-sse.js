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
    "event: updaten",
    "data: foo = barn",
    "data: baz = batn",
    "n",
  ];

  const resultUpdate =  {foo: "bar", baz: "bat"};

  emitter.on('SSEvent', e => {
    switch (e.type) {
    case 'message': log(`message event! ${JSON.stringify(e)}`); break;
    case 'update':
      const result = parseUpdate(e.data);
      if (JSON.stringify(result) == JSON.stringify(resultUpdate)) {
        process.exit();
      } else {
        err(`${JSON.stringify(result)} DID NOT MATCH:n` +
            `${JSON.stringify(resultUpdate)}`);
        process.exit();
      }
      break;
    default: process.exit(); break;
    }
    process.exit();
  });

  function parseUpdate(data) {
    let obj = {};
    (""+data).split(/n|rn/).forEach( line => {
      const m = line.trim().match(/^(w+)s*=s*(w+)$/);
      if (! m) {
        process.exit(2);
      } else {
        obj[m[]] = m[2];
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

  let anEvent = { type: "pingpong", data: "nnn" };
  const turns = 4; // how many times to ping-pong

  const startMilli = new Date();

  const pong = new SSEventEmitter();
  pong.on('SSEvent', e => {
    // log(`pong got ${JSON.stringify(e)}`);
    if (e.type === "pingpong") {
      let i = parseInt(e.data, );
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
      let i = parseInt(e.data, );
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
