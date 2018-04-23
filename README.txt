
ClientWrangler - wrangler of clients

Clients are duplex streams that come and go according to their own
life cycle. Usually, these are independent processes communicating
with this JS program using sockets, but they could be in-process JS
functions directly creating duplex streams whenever they wish to
communicate.

Servers are any JS functions that communicate with these clients when
contacted.

Both clients and servers must understand SSE. Clients must compose and
parse all their stream communication using the SSE format. Servers
must use the SSE utility class.

ClientWrangler and SSE together isolate servers from having
to deal with sockets or communications. Servers simply need to decide
on an application-level protocol with their clients, and then
subscribe to the global ClientWrangler object. ClientWrangler emits
events when the clients connect and send their first event.
Thereafter, servers can communicate with the clients using SSE events.

Clients are first introduced to ClientWrangler with the "newClient"
method, and the first SSE event they send determines how they are
treated. This first event is directed at ClientWrangler:

- fireAndForget - client just wants to send a command and then
  drop the connection. The command itself is in the data field.

   [client] --> fireAndForget ---> [wrangler] ------+
                                                    |
                                                  data
                                                    |
                                                    V
                                                 [server]


- oneShotCommand - client wants to send a command, wait for a
  response, and then drop the connection. Then command itself
  is in the data field.

   [client] --> oneShotCommand --> [wrangler] ------+
                                                    |
                                                  data
                                                    |
                                                    V
                                                 [server]
                                                    |
                                              sendSuccess()
                                                    |
   [client] <---- replySuccess-----[wrangler]-------+
                                                   

- appConnect - client wants to stay connected and exchange events.

   [client] --> appConnect ---> [wrangler] ---------+
                                                    |
                                                data, sse
                                                    |
                                                    V
                                                 [server]
                                    [client] <--- sse <--- [server]
                                    [client] ---> sse ---> [server]
                                    [client] <--- sse <--- [server]
                                                   ...
                                             

These three types of events define three different kinds of clients in
terms of their connection convention. The *content* of their
communication is understood only by the client and server.

Essentially, ClientWrangler defines two "enveloping" protocols, one
with the clients and the other with the servers, which determine the
sequence of connections and disconnections allowed. Within these
enveloping protocols, the ClientWrangler includes as payload the
actual contents of the client-server communication. The payload
consists of SSE objects which represent clients, or the 'data' field
inside the first client event. These enveloping protocols serve to
isolate the servers from the details of connections.

Clients still need to use sockets (if they are in separate processes
from the servers) or duplex streams (if they are in the same
process). Clients need to understand both the enveloping client
protocol as well as the application-level protocol agreed to with
their servers. But the servers can just use SSE objects and events,
concentrating on their own application-level protocol.


What Servers Can Do:

Servers must define and own their own protocol, so that they can
recognize their own clients and respond to them. The ClientWrangler
does not know anything about the servers or their protocols. Multiple
servers must avoid stepping on each others' clients.

Events emitted by ClientWrangler:

- fireAndForget lines
- oneShotCommand { lines, sendSuccess, sendError }
- appConnect { lines, sse, dropConnection }
- disconnect sse

Subscribing to the four ClientWrangler events:

- fireAndForget - the argument is just the data lines in the
  fireAndForget event. Any server that subscribes to this event must
  examine these lines and make sure they are targeted to
  itself. Server can then consume the data lines and do what it will.
  ClientWrangler will automatically drop the client connection if
  the client has not done so.

- oneShotCommand - the argument is an object like this:

     { lines, sendSuccess, sendError }.

  The interested server can consume the "lines", a string data field
  of the oneShotCommand event. When done, the server must call
  sendSuccess() with any lines to send as a reply (could be an empty
  string). Or, it should call sendError() with an error string. If the
  client has not already disconnected, then ClientWrangler will send
  the reply along and then close the connection.  The client will see
  a reply SSE event, either 'replySuccess' with any returned data in
  the data field, or 'replyError' with a string in the data field.
  The "sendSuccess" and "sendError" functions take two arguments:
  the first argument is a string that the server would like to send,
  and the second is a callback function that client wrangler will call:

      function sendSuccess(msgString, cb)
      cb(errMsg)

  The "errMsg" argument will be null if there was no problem;
  otherwise, the errMsg argument will be a string describing the
  problem.

- appConnect - the argument is:

      { lines, sse, dropConnection }

  The member "lines" is the multi-line sring from the data field of
  the first event sent by the client.  The "sse" is an SSE object
  representing the client.  The "dropConnection" is a function to call
  to terminate communication with this client, if the server wishes to
  use this method to conclude the exchange.

  The server should hold on to the SSE, subscribe to its 'SSEvent'
  events, and use sendEvent() to communicate with the client as
  necessary. The 'disconnect' event (see below) terminates the
  connection from the client side.

  The client will see a reply from the server to the first event, and
  following that, it can follow the application protocol to exchange
  events with the server. If the protocol includes a goodbye message,
  then the client can use that message to drop the connection as
  agreed. If the client wishes to terminate the exchange, it can do so
  directly by dropping the connection.

- disconnect - any client can drop a connection at any time; if it
  does, the 'disconnect' event will be emitted by ClientWrangler.
  The argument is the SSE object representing the client.

  Servers handling any appConnect clients must subscribe to this
  "disconnect" event and stop all communication with the corresponding
  client SSE if it happens.


