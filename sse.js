/**
   Copyright 2018 Sudheer Apte

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

"use strict";

/**
   sse - use the Server-Sent Events W3C standard.

   https://www.w3.org/TR/eventsource/

   Can parse events, or send "message" events, using streams.

   You can create an instance of SSEventEmitter and then use it for
   either parsing events from a readable stream, or for writing
   message events to a writable stream, or both simultaneously.

   Parsing:

   Any type of event can be parsed from a given readable stream.
   Use readFrom() to start parsing:

      const SSEventEmitter = require('./sse.js');
      const myEmitter = new SSEventEmitter();
      myEmitter.on('SSEvent', (ev) => {...});
      myEmitter.readFrom(readStreamFromSomewhere);

   The last line both sets a readable stream and immediately starts
   parsing the data coming from the readable stream.

   This object will now emit an event named 'SSEvent' every time it
   parses one on the supplied readStream. The argument structure "ev"
   will have three string-valued attributes:

      type: the type of event, by default, "message".
      lastEventId: a number, not useful for our case
      data: newline-separated data lines if more than one.

   The meanings of these attributes are explained in the W3C SSE
   standard.

   Sending messages:

   Use setWriteStream() to set the writable stream, then repeatedly
   call sendEvent(e) where "e" has { type, lastEventId, data }.
   This will write an SSE event to the writable stream.

   If the data item is empty or blank, then no event will be
   sent. If the data string is multi-line, then multi-line data will
   be sent in the "data" field. In any case, an event of the indicated
   type will be sent to the other side.

 */

const EventEmitter = require('events');

class SSEventEmitter extends EventEmitter {
  constructor() {
    super();
    this.currData = "";  // all the data for this event so far
    this.fragment = "";  // any non-terminated fragment seen so far
    this.currEventType = "";
    this.lastEventId = "";
    this.currField = "";
  }
  readFrom(readStream) {
    readStream.on('data', this.consumeData.bind(this) );
    readStream.on('error', this.consumeError.bind(this) );
    readStream.on('close', this.consumeClose.bind(this) );
  }
  setWriteStream(writeStream) {
    const me = this; // for binding in callbacks
    this.writeStream = writeStream;
    writeStream.on('error', () => { me.writeStream = null } );
    writeStream.on('close', () => { me.writeStream = null } );
  }
  sendEvent(e) {  // must be like this: { type, lastEventId, data }
    if (! this.writeStream) { return; }
    log(`sendEvent sending ${JSON.stringify(e)}`);
    let buf = "";
    buf += `event: ${e.type}\n`;
    if (e.lastEventId) {
      buf += `lastEventId: ${e.lastEventId}\n`;
    }
    let lines = e.data.split(/\n|\r\n/);
    lines.forEach( line => {
      buf += `data: ${line}\n`;
    });
    this.writeStream.write(`${buf}\n`);
  }
  sendMessage(s) {
    if (! s) { return; }
    if (s.trim().length <= 0) { return; }
    this.sendEvent({type: "message", data: s});
  }
  consumeData(data) {
    const str = ""+data;
    if (str.length < 1) { return; }

    const lines = str.split(/\n|\r\n/);
    lines.forEach( (line, i) => {
      const lastLine = (i === lines.length -1) ? true : false;

      // When the input is newline-terminated, then the "split" will
      // create an extra, empty last line.  If the last line is not
      // empty, then we know it is a fragment, so we need its contents.

      if (lastLine) {
        if (line.length > 0) {
          this.fragment += line;
        }
        return; // otherwise the last line is meaningless.
      }

      // All other lines were newline-terminated in the input.
      // They complete any fragment we have so far.
      line = this.fragment + line;
      this.fragment = "";

      if (line.length === 0) { // the end of an event.
        this.dispatchEvent();
      } else if (line.startsWith(":")) { // empty keyword: ignore
        return;
      } else if (line.indexOf(":") >= 0) { // "key: value" format
	this.processFieldLine(line);
      } else {
        this.processEmptyFieldLine(line);
      }
    });
  }
  processFieldLine(line) {
    const pos = line.indexOf(":");
    if ( pos < 0) { err("impossible!") }
    const field = line.slice(0, pos);
    let value = line.slice(pos+1);
    if (value.length > 0) {
      if (value[0] === " ") { value = value.slice(1); }
    }
    switch(field) {
    case "event": this.currEventType = value; this.currData = ""; break;
    case "data": this.currData += value + "\n"; break;
    case "id" : this.lastEventId = value; break;
    case "retry": /* ignore */ ; break;
    default: /* ignore */;
    }
  }
  processEmptyFieldLine(line) {
    /* ignore */
  }
  dispatchEvent() {
    // Remove trailing newline if any
    const len = this.currData.length;
    if (len >0 && this.currData[len-1] === '\n') {
      this.currData = this.currData.slice(0, len-1);
    }
    // if (! this.currData) { this.currEventType = ""; return; }
    let ev = { type: "message", data: this.currData };
    if (this.currEventType) { ev.type = this.currEventType }
    ev.lastEventId = this.lastEventId;
    this.currData = ""; this.currEventType = "";
    log(`emitting: type = |${ev.type}|`);
    this.emit('SSEvent', ev);
  }
  consumeError(err) {
    console.log("SSEventEmitter: error on input stream: " + err);
  }
  consumeClose() {
    this.dispatchEvent();
  }
}

module.exports = SSEventEmitter;

function log(str) {
  if (! process.env["DEBUG"]) { return; }
  console.log(`sse: ${str}`);
}
