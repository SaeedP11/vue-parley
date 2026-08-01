// Browser polyfill for Node's `events` module.
// Bundled into the library because `simple-peer` -> `readable-stream`
// -> `_stream_readable.js` requires `events`.EventEmitter, and Vite
// otherwise externalizes the Node built-in to an empty object for the
// browser target.

function EventEmitter(this: any) {
  EventEmitter.init.call(this);
}

EventEmitter.init = function (this: any) {
  if (
    this._events === undefined ||
    this._events === Object.getPrototypeOf(this)._events
  ) {
    this._events = {};
    this._eventsCount = 0;
  }
  this._maxListeners = this._maxListeners || EventEmitter.defaultMaxListeners || 10;
};

EventEmitter.defaultMaxListeners = 10;

EventEmitter.prototype.setMaxListeners = function (this: any, n: number) {
  if (typeof n !== "number" || n < 0 || isNaN(n))
    throw TypeError("n must be a non-negative number");
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.getMaxListeners = function (this: any) {
  return this._maxListeners;
};

EventEmitter.prototype.emit = function (this: any, type: string) {
  const events = this._events;
  const handler = events && events[type];
  if (!handler) {
    if (type === "error") {
      const er = arguments[1];
      if (er instanceof Error) throw er;
      throw new Error("Uncaught, unspecified 'error' event");
    }
    return false;
  }
  const args = Array.prototype.slice.call(arguments, 1);
  if (typeof handler === "function") {
    handler.apply(this, args);
  } else if (Array.isArray(handler)) {
    const arr = handler.slice();
    for (let i = 0; i < arr.length; i++) arr[i].apply(this, args);
  }
  return true;
};

function _addListener(
  target: any,
  type: string,
  listener: Function,
  prepend: boolean,
) {
  if (typeof listener !== "function")
    throw TypeError("listener must be a function");
  let events = target._events;
  if (!events) {
    events = target._events = {};
    target._eventsCount = 0;
  } else {
    const existing = events[type];
    if (existing === undefined) {
      target._eventsCount++;
    } else {
      if (typeof existing === "function") {
        events[type] = prepend ? [listener, existing] : [existing, listener];
      } else if (Array.isArray(existing)) {
        prepend ? existing.unshift(listener) : existing.push(listener);
      }
      return target;
    }
  }
  events[type] = listener;
  return target;
}

EventEmitter.prototype.addListener = EventEmitter.prototype.on = function (
  this: any,
  type: string,
  listener: Function,
) {
  return _addListener(this, type, listener, false);
};

EventEmitter.prototype.prependListener = function (
  this: any,
  type: string,
  listener: Function,
) {
  return _addListener(this, type, listener, true);
};

EventEmitter.prototype.once = function (
  this: any,
  type: string,
  listener: Function,
) {
  if (typeof listener !== "function")
    throw TypeError("listener must be a function");
  const wrapper = function (this: any) {
    this.removeListener(type, wrapper);
    listener.apply(this, arguments);
  };
  (wrapper as any).listener = listener;
  return this.on(type, wrapper);
};

EventEmitter.prototype.prependOnceListener = function (
  this: any,
  type: string,
  listener: Function,
) {
  if (typeof listener !== "function")
    throw TypeError("listener must be a function");
  const wrapper = function (this: any) {
    this.removeListener(type, wrapper);
    listener.apply(this, arguments);
  };
  (wrapper as any).listener = listener;
  return this.prependListener(type, wrapper);
};

EventEmitter.prototype.removeListener = function (
  this: any,
  type: string,
  listener: Function,
) {
  if (typeof listener !== "function")
    throw TypeError("listener must be a function");
  const events = this._events;
  if (!events) return this;
  const list = events[type];
  if (!list) return this;
  if (list === listener || list.listener === listener) {
    if (--this._eventsCount === 0) this._events = {};
    else delete events[type];
  } else if (Array.isArray(list)) {
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i] === listener || list[i].listener === listener) {
        list.splice(i, 1);
        if (list.length === 0) {
          --this._eventsCount;
          delete events[type];
        }
        break;
      }
    }
  }
  return this;
};

EventEmitter.prototype.off = EventEmitter.prototype.removeListener;

EventEmitter.prototype.removeAllListeners = function (this: any, type?: string) {
  const events = this._events;
  if (!events) return this;
  if (type === undefined) {
    this._events = {};
    this._eventsCount = 0;
  } else if (events[type] !== undefined) {
    --this._eventsCount;
    delete events[type];
  }
  return this;
};

EventEmitter.prototype.listeners = function (this: any, type: string) {
  const events = this._events;
  if (!events || !events[type]) return [];
  const list = events[type];
  if (typeof list === "function") return [list.listener || list];
  return list.map(function (l: any) {
    return l.listener || l;
  });
};

EventEmitter.prototype.rawListeners = function (this: any, type: string) {
  const events = this._events;
  if (!events || !events[type]) return [];
  const list = events[type];
  return Array.isArray(list) ? list.slice() : [list];
};

EventEmitter.prototype.listenerCount = function (this: any, type: string) {
  const events = this._events;
  if (!events) return 0;
  const list = events[type];
  if (!list) return 0;
  return typeof list === "function" ? 1 : list.length;
};

EventEmitter.prototype.eventNames = function (this: any) {
  const events = this._events;
  if (!events) return [];
  return Object.keys(events).filter(function (k: string) {
    return events[k] !== undefined;
  });
};

EventEmitter.EventEmitter = EventEmitter;
EventEmitter.usingDomains = false;
(EventEmitter as any).captureRejectionSymbol = Symbol("captureRejections");
(EventEmitter as any).captureRejections = false;

export { EventEmitter };
export default EventEmitter;