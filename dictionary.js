"use strict";

/**
   @module(dictionary) - dictionary of appliance description variables

   Every time you set or delete a variable
   After that, any changes cause events to be emitted:

   Events

     'created' var
     'deleted' var
     'updated' var value oldValue

   Commands

      get(var) => value or undefined
      set(var, value)
      delete(var)
      
      The "set" command checks to make sure the new value is different
      from the old value, otherwise it becomes a no-op.
      When successful, the "set" command always generates an "updated" event.
      If the variable did not exist before, then a "created" event
      is generated first, and then an "updated" event.
   
      vars() => an iterable containing the variable names in insertion
      order.

 */

const EventEmitter = require('events');

class Dictionary extends EventEmitter {
  constructor() {
    super();
    this._map = new Map();
    this.setMaxListeners(20);
  }

  get(name) {
    if (this._map.has(name)) { return this._map.get(name); }
  }

  set(name, value) {
    const oldValue = this._map.get(name);
    if (oldValue === value) {
      return;
    }
    let newName = false;
    if (!this._map.has(name)) {
      newName = true;
    }
    this._map.set(name, value);
    if (newName) { this.emit('created', name) }
    this.emit('updated', name, value, oldValue);
  }

  delete(name) {
    if (this._map.has(name)) {
      this._map.delete(name);
      this.emit('deleted', name);
    }
  }

  vars() {
    return this._map.keys();
  }
}

module.exports = new Dictionary();
