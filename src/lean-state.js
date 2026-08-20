/**
 * @module lean-state
 * @description Zero-import application kernel: identity, configuration, state management, 
 * message bus, and cross-tab bridge. Attaches globally to `window.leanState`.
 * @version 1.3.0
 */

(function (global) {
  "use strict";

  /** 
   * @typedef {Object} LeanStateConfig
   * @property {string} [app='lean-app'] - The global application identifier.
   * @property {string} [namespace='default'] - Namespace for isolating state/bus within the app.
   * @property {'window'|'app'} [scope='window'] - Instance scope ('window' isolates to the tab, 'app' shares identity).
   * @property {'auto'|'memory'|'local'|'session'} [storage='auto'] - Preferred storage backend.
   * @property {number} [throttle=420] - Milliseconds to throttle persistence writes.
   * @property {boolean} [debug=false] - Enable internal console logging.
   * @property {boolean} [handshake=true] - Ensure context is alive before processing subscriptions.
   * @property {number} [heartbeat=30000] - Interval (ms) to prune dead bus subscribers.
   * @property {string} [bridgeChannel='lean-app'] - BroadcastChannel name for cross-tab communication.
   */

  /**
   * @typedef {Object} LeanStateIdentity
   * @property {string} app - The configured application identifier.
   * @property {string} namespace - The configured namespace.
   * @property {string} instance - The raw instance ID (e.g., tab-specific token).
   * @property {string} runtime - The deterministically hashed runtime ID.
   */

  /**
   * @typedef {Object} StateOptions
   * @property {'transient'|'session'|'persistent'} [persistence='transient'] - Storage duration.
   */

  /**
   * @typedef {Object} BusOptions
   * @property {Object|Window|Document|Node|Function} [context=global] - DOM node or object to test for liveness.
   * @property {boolean} [weak=false] - Use WeakRef for the handler to allow garbage collection.
   */

  /**
   * @typedef {Object} BusMessage
   * @property {string} id - Unique message envelope ID.
   * @property {string} runtime - The runtime ID of the sender.
   * @property {string} channel - The channel the message was published on.
   * @property {number} timestamp - Epoch timestamp of when the message was sent.
   * @property {number} sequence - The sequence number within the channel.
   * @property {Object} payload - The user-defined message payload.
   * @property {Function} [_resolve] - Internal promise resolver.
   */

  /**
   * @typedef {Object} StorageAdapter
   * @property {string} type - Identifier for the storage type ('memory', 'local', 'session').
   * @property {function(string): string|null} getItem - Retrieves an item.
   * @property {function(string, string): void} setItem - Stores an item.
   * @property {function(string): void} removeItem - Deletes an item.
   * @property {function(number): string|null} key - Retrieves a key by index.
   * @property {number} length - Number of items in storage.
   */

  var HAS_WEAKREF = typeof WeakRef !== "undefined";
  var HAS_BROADCAST = typeof global.BroadcastChannel !== "undefined";

  // ===========================================================================
  // Core Utilities & Identity
  // ===========================================================================

  /**
   * Tiny deterministic hash (FNV-1a 32-bit → hex). No crypto dependency.
   * @private
   * @param {string} str - String to hash.
   * @returns {string} 8-character hex string.
   */
  function hash32(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  }

  /**
   * Generates a unique runtime identifier based on app config and instance.
   * @private
   * @param {string} app - Application identifier.
   * @param {string} namespace - Namespace.
   * @param {string} instance - Instance ID.
   * @returns {string} Hashed runtime ID.
   */
  function makeRuntimeId(app, namespace, instance) {
    return hash32(String(app) + "\0" + String(namespace) + "\0" + String(instance));
  }

  /**
   * Derives or creates a unique instance identity using `window.name` as a persistence vector.
   * @private
   * @returns {string} Instance token.
   */
  function getOrCreateInstanceId() {
    try {
      if (typeof global.name === "string" && global.name.indexOf("lean-") === 0) {
        return global.name.slice(5);
      }
      var token = "w" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
      try {
        global.name = "lean-" + token;
      } catch (_) {}
      return token;
    } catch (_) {
      return "w" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    }
  }

  // ===========================================================================
  // Storage Adapters
  // ===========================================================================

  /**
   * Creates a volatile, in-memory fallback storage adapter.
   * @private
   * @returns {StorageAdapter}
   */
  function createMemoryStorage() {
    var map = Object.create(null);
    return {
      type: "memory",
      getItem: function (k) { return k in map ? map[k] : null; },
      setItem: function (k, v) { map[k] = String(v); },
      removeItem: function (k) { delete map[k]; },
      key: function (i) { return Object.keys(map)[i] || null; },
      get length() { return Object.keys(map).length; },
    };
  }

  /**
   * Wraps a native Web Storage API (localStorage/sessionStorage) safely.
   * @private
   * @param {Storage|null} store - The native storage object.
   * @param {string} label - Label for the storage type ('local' or 'session').
   * @returns {StorageAdapter|null}
   */
  function wrapWebStorage(store, label) {
    if (!store) return null;
    try {
      var testKey = "lean_test";
      store.setItem(testKey, "1");
      store.removeItem(testKey);
    } catch (_) {
      return null;
    }
    return {
      type: label,
      getItem: function (k) { try { return store.getItem(k); } catch (_) { return null; } },
      setItem: function (k, v) { try { store.setItem(k, v); } catch (_) {} },
      removeItem: function (k) { try { store.removeItem(k); } catch (_) {} },
      key: function (i) { try { return store.key(i); } catch (_) { return null; } },
      get length() { try { return store.length; } catch (_) { return 0; } },
    };
  }

  // ===========================================================================
  // Configuration & Resolution
  // ===========================================================================

  var DEFAULTS = {
    app: "lean-app",
    namespace: "default",
    scope: "window",
    storage: "auto",
    throttle: 420,
    debug: false,
    handshake: true,
    heartbeat: 30000,
    bridgeChannel: "lean-app",
  };

  var instanceId = getOrCreateInstanceId();
  var userConfig = {};
  var resolved = null;
  var storageBackend = null;
  var memoryFallback = createMemoryStorage();
  var bridge = null;

  /**
   * Determines the optimal storage adapter based on user preference and availability.
   * @private
   * @param {string} preference - 'auto', 'memory', 'local', or 'session'.
   * @returns {StorageAdapter}
   */
  function resolveStorage(preference) {
    var local = wrapWebStorage(typeof global.localStorage !== "undefined" ? global.localStorage : null, "local");
    var session = wrapWebStorage(typeof global.sessionStorage !== "undefined" ? global.sessionStorage : null, "session");
    
    if (preference === "memory") return memoryFallback;
    if (preference === "local") return local || memoryFallback;
    if (preference === "session") return session || memoryFallback;
    return local || session || memoryFallback;
  }

  /**
   * Recomputes all operational parameters from defaults and user config.
   * @private
   * @returns {Object} Internal resolved configuration.
   */
  function computeResolved() {
    var c = Object.assign({}, DEFAULTS, userConfig);
    storageBackend = resolveStorage(c.storage);
    
    var runtimeApp = c.app;
    var runtimeNamespace = c.namespace;
    var effectiveInstance = c.scope === "app" ? "shared" : instanceId;
    var runtimeId = makeRuntimeId(runtimeApp, runtimeNamespace, effectiveInstance);

    return {
      app: runtimeApp,
      namespace: runtimeNamespace,
      scope: c.scope === "app" ? "app" : "window",
      storage: storageBackend.type,
      storagePreference: c.storage,
      throttle: typeof c.throttle === "number" && c.throttle >= 0 ? c.throttle : DEFAULTS.throttle,
      debug: !!c.debug,
      handshake: c.handshake !== false,
      heartbeat: typeof c.heartbeat === "number" && c.heartbeat >= 0 ? c.heartbeat : DEFAULTS.heartbeat,
      bridgeChannel: c.bridgeChannel,
      _instance: effectiveInstance,
      _runtime: runtimeId,
      _rawInstance: instanceId,
    };
  }

  resolved = computeResolved();

  /**
   * Initializes the cross-tab BroadcastChannel bridge if available and configured.
   * @private
   */
  function setupBridge() {
    if (bridge) {
      try { bridge.close(); } catch (_) {}
      bridge = null;
    }
    if (!HAS_BROADCAST || !resolved.bridgeChannel) return;

    try {
      bridge = new BroadcastChannel(resolved.bridgeChannel);
      bridge.addEventListener("message", function (event) {
        if (event.data && event.data.channel) {
          var payload = event.data.payload || {};
          payload._fromBridge = true;
          busSend(event.data.channel, payload);
        }
      });
    } catch (_) {}
  }

  setupBridge();

  /**
   * Generates a fully qualified storage key string.
   * @private
   * @param {string} key - Logical key name.
   * @param {string} persistence - Persistence level.
   * @returns {string} Formatted storage key.
   */
  function storageKey(key, persistence) {
    var r = resolved;
    var prefix = "lean:" + r.app + ":" + r.namespace + ":" + (r.scope === "app" ? "app" : r._rawInstance) + ":";
    
    if (persistence === "session") prefix += "s:";
    else if (persistence === "persistent") prefix += "p:";
    else prefix += "t:";
    
    return prefix + key;
  }

  /**
   * Maps a requested persistence level to a specific storage backend.
   * @private
   * @param {string} persistence - Level ('transient', 'session', 'persistent').
   * @returns {StorageAdapter}
   */
  function getStorageForPersistence(persistence) {
    if (persistence === "transient") return memoryFallback;
    
    var sessionStore = wrapWebStorage(typeof global.sessionStorage !== "undefined" ? global.sessionStorage : null, "session");
    if (persistence === "session") return sessionStore || memoryFallback;
    
    var localStore = wrapWebStorage(typeof global.localStorage !== "undefined" ? global.localStorage : null, "local");
    return localStore || sessionStore || memoryFallback;
  }

  // ===========================================================================
  // State Management
  // ===========================================================================

  var memoryState = Object.create(null);
  var keySubscribers = Object.create(null);
  var pendingPersist = Object.create(null);
  var persistTimer = null;

  /**
   * Internal logger. Output depends on `config.debug`.
   * @private
   */
  function log() {
    if (resolved && resolved.debug && typeof console !== "undefined") {
      console.log.apply(console, ["[lean-state]"].concat(Array.prototype.slice.call(arguments)));
    }
  }

  /**
   * Executes functions safely, catching and routing errors.
   * @private
   * @param {Function} fn - Function to execute.
   * @param {Array} args - Arguments array.
   * @param {string} [label] - Context string for error logging.
   * @returns {*}
   */
  function safeCall(fn, args, label) {
    try {
      return fn.apply(null, args);
    } catch (err) {
      if (resolved && resolved.debug && typeof console !== "undefined") {
        console.error("[lean-state] handler error" + (label ? " (" + label + ")" : ""), err);
      }
      if (typeof leanState !== "undefined" && leanState._onError) {
        try { leanState._onError(err, label); } catch (_) {}
      }
      return undefined;
    }
  }

  /**
   * Pushes state updates to all subscribers for a given key.
   * @private
   * @param {string} key - State key.
   * @param {*} value - New value.
   */
  function notifyKey(key, value) {
    var set = keySubscribers[key];
    if (!set) return;
    set.forEach(function (handler) {
      safeCall(handler, [value, key], "state:" + key);
    });
  }

  /**
   * Debounces persistence operations based on configured throttle time.
   * @private
   */
  function schedulePersistAndNotify() {
    if (persistTimer != null) return;
    var delay = resolved.throttle;
    
    if (delay <= 0) {
      flushPersistAndNotify();
      return;
    }
    
    persistTimer = setTimeout(function () {
      persistTimer = null;
      flushPersistAndNotify();
    }, delay);
  }

  /**
   * Processes the pending persistence queue, writing to Web Storage and notifying listeners.
   * @private
   */
  function flushPersistAndNotify() {
    var keys = Object.keys(pendingPersist);
    pendingPersist = Object.create(null);
    
    keys.forEach(function (key) {
      var entry = memoryState[key];
      
      if (!entry) {
        try {
          getStorageForPersistence("persistent").removeItem(storageKey(key, "persistent"));
          getStorageForPersistence("session").removeItem(storageKey(key, "session"));
        } catch (_) {}
        notifyKey(key, undefined);
        return;
      }
      
      var persistence = entry.persistence || "transient";
      if (persistence === "transient") {
        notifyKey(key, entry.value);
        return;
      }
      
      var store = getStorageForPersistence(persistence);
      var sk = storageKey(key, persistence);
      
      try {
        store.setItem(sk, JSON.stringify({ v: entry.value, t: Date.now() }));
      } catch (_) {}
      notifyKey(key, entry.value);
    });
  }

  /**
   * Reads existing data from Web Storage into memory on boot or config change.
   * @private
   */
  function hydrateFromStorage() {
    ["session", "persistent"].forEach(function (p) {
      var store = getStorageForPersistence(p);
      if (store.type === "memory") return;
      
      var r = resolved;
      var base = "lean:" + r.app + ":" + r.namespace + ":" + (r.scope === "app" ? "app" : r._rawInstance) + ":" + (p === "session" ? "s:" : "p:");
      
      try {
        for (var i = 0; i < store.length; i++) {
          var k = store.key(i);
          if (!k || k.indexOf(base) !== 0) continue;
          
          var logical = k.slice(base.length);
          if (!logical || logical in memoryState) continue;
          
          var raw = store.getItem(k);
          if (raw == null) continue;
          
          try {
            var parsed = JSON.parse(raw);
            memoryState[logical] = {
              value: parsed && "v" in parsed ? parsed.v : parsed,
              persistence: p,
            };
          } catch (_) {}
        }
      } catch (_) {}
    });
  }

  /**
   * Retrieves a value from the application state.
   * 
   * @memberof module:lean-state
   * @param {string} key - The state key to retrieve.
   * @returns {*} The stored value, or undefined if not found.
   */
  function get(key) {
    if (key in memoryState) return memoryState[key].value;
    return undefined;
  }

  /**
   * Sets a value in the application state and schedules persistence/notification.
   * 
   * @memberof module:lean-state
   * @param {string} key - The state key to set.
   * @param {*} value - The value to store.
   * @param {StateOptions} [options] - Storage duration options.
   * @returns {*} The value that was set.
   */
  function set(key, value, options) {
    options = options || {};
    var persistence = options.persistence || "transient";
    if (persistence !== "session" && persistence !== "persistent") persistence = "transient";
    
    memoryState[key] = { value: value, persistence: persistence };
    pendingPersist[key] = true;
    schedulePersistAndNotify();
    return value;
  }

  /**
   * Removes a key from the application state.
   * 
   * @memberof module:lean-state
   * @param {string} key - The state key to remove.
   */
  function remove(key) {
    if (key in memoryState) {
      delete memoryState[key];
      pendingPersist[key] = true;
      schedulePersistAndNotify();
    }
  }

  /**
   * Checks if a key exists in the application state.
   * 
   * @memberof module:lean-state
   * @param {string} key - The state key to verify.
   * @returns {boolean} True if the key exists, false otherwise.
   */
  function has(key) {
    return key in memoryState;
  }

  /**
   * Subscribes to changes on a specific state key.
   * 
   * @alias subscribe
   * @memberof module:lean-state
   * @param {string} key - The state key to watch.
   * @param {function(*, string): void} handler - Callback invoked when the key changes.
   * @returns {function(): void} An unsubscribe function to stop watching.
   */
  function subscribeState(key, handler) {
    if (typeof handler !== "function") return function () {};
    if (!keySubscribers[key]) keySubscribers[key] = new Set();
    
    keySubscribers[key].add(handler);
    
    return function unsubscribe() {
      if (keySubscribers[key]) {
        keySubscribers[key].delete(handler);
        if (keySubscribers[key].size === 0) delete keySubscribers[key];
      }
    };
  }

  // ===========================================================================
  // Message Bus & Liveness Probes
  // ===========================================================================

  /**
   * Evaluates if a given DOM Node, Window, or generic object is still "alive" 
   * to prevent memory leaks from abandoned bus subscriptions.
   * @private
   * @param {*} context - The object to evaluate.
   * @returns {boolean}
   */
  function isContextAlive(context) {
    try {
      if (context == null) {
        if (typeof global.closed === "boolean" && global.closed) return false;
        if (typeof document !== "undefined" && !document.documentElement) return false;
        return true;
      }
      if (typeof context === "function") return !!context();
      if (typeof context === "object" && typeof context.alive === "function") return !!context.alive();
      if (typeof context.closed === "boolean") return !context.closed;
      
      if (context.nodeType === 9) { // Document node
        var view = context.defaultView;
        if (view && typeof view.closed === "boolean" && view.closed) return false;
        return !!context.documentElement;
      }
      
      if (typeof context.nodeType === "number") { // DOM Element
        if (typeof context.isConnected === "boolean") return context.isConnected;
        var root = context;
        while (root && root.parentNode) root = root.parentNode;
        return !!(root && root.nodeType === 9);
      }
      
      return true;
    } catch (_) {
      return false;
    }
  }

  var channels = Object.create(null);
  var globalHeartbeatTimer = null;

  /**
   * Initializes a channel if it does not exist.
   * @private
   * @param {string} name - Channel name.
   * @returns {Object} Internal channel structure.
   */
  function ensureChannel(name) {
    if (!channels[name]) {
      channels[name] = {
        queue: [],
        processing: false,
        subscribers: new Set(),
        sequence: 0,
      };
    }
    return channels[name];
  }

  /**
   * Retrieves the handler for a subscription, resolving WeakRefs if necessary.
   * @private
   * @param {Object} sub - Subscription object.
   * @returns {Function|null}
   */
  function getHandler(sub) {
    if (sub.dead) return null;
    if (sub.handlerRef) {
      var h = sub.handlerRef.deref();
      return h || null;
    }
    return sub.handler || null;
  }

  /**
   * Marks a subscription as dead and removes it from the channel.
   * @private
   * @param {Object} sub - Subscription object.
   */
  function dropSubscription(sub) {
    if (!sub || sub.dead) return;
    sub.dead = true;
    if (sub.timer != null) {
      clearInterval(sub.timer);
      sub.timer = null;
    }
    var ch = channels[sub.channel];
    if (ch) ch.subscribers.delete(sub);
    log("orphan dropped", sub.channel);
  }

  /**
   * Validates a subscription before executing its handler.
   * @private
   * @param {Object} sub - Subscription object.
   * @returns {boolean}
   */
  function handshake(sub) {
    if (!sub || sub.dead) return false;
    if (!getHandler(sub)) {
      dropSubscription(sub);
      return false;
    }
    if (resolved.handshake && !isContextAlive(sub.context)) {
      dropSubscription(sub);
      return false;
    }
    return true;
  }

  /**
   * Removes dead subscriptions from a specific channel.
   * @private
   * @param {string} name - Channel name.
   * @returns {number} Amount of dropped subscriptions.
   */
  function pruneChannel(name) {
    var ch = channels[name];
    if (!ch) return 0;
    var dropped = 0;
    Array.from(ch.subscribers).forEach(function (sub) {
      if (!handshake(sub)) dropped += 1;
    });
    return dropped;
  }

  /**
   * Triggers a manual garbage collection sweep across all bus channels.
   * 
   * @alias prune
   * @memberof module:lean-state.bus
   * @returns {number} The total number of dead subscriptions dropped.
   */
  function busPrune() {
    var dropped = 0;
    Object.keys(channels).forEach(function (name) {
      dropped += pruneChannel(name);
    });
    return dropped;
  }

  /**
   * Sets up the global heartbeat to periodically clean up abandoned bus listeners.
   * @private
   */
  function ensureGlobalHeartbeat() {
    if (globalHeartbeatTimer != null) {
      clearInterval(globalHeartbeatTimer);
      globalHeartbeatTimer = null;
    }
    var ms = resolved.heartbeat;
    if (!ms || ms <= 0) return;
    
    globalHeartbeatTimer = setInterval(function () {
      busPrune();
    }, ms);
    
    if (typeof globalHeartbeatTimer.unref === "function") {
      try { globalHeartbeatTimer.unref(); } catch (_) {}
    }
  }

  ensureGlobalHeartbeat();

  /**
   * Emits a message across the BroadcastChannel if the bridge is active.
   * @private
   * @param {string} channel - Channel name.
   * @param {Object} payload - User payload.
   */
  function broadcastLocalMessage(channel, payload) {
    if (bridge && payload && !payload._fromBridge) {
      try { bridge.postMessage({ channel: channel, payload: payload }); } catch (_) {}
    }
  }

  /**
   * Internal processor for draining a channel's message queue.
   * @private
   * @param {string} name - Channel name.
   */
  function processChannel(name) {
    var ch = channels[name];
    if (!ch || ch.processing) return;
    ch.processing = true;

    pruneChannel(name);

    function next() {
      if (!ch.queue.length) {
        ch.processing = false;
        return;
      }
      var msg = ch.queue.shift();
      var subs = Array.from(ch.subscribers);
      var i = 0;

      function runOne() {
        while (i < subs.length) {
          var sub = subs[i++];
          if (sub.dead || !handshake(sub)) continue;

          var handler = getHandler(sub);
          if (!handler) {
            dropSubscription(sub);
            continue;
          }

          var result;
          try {
            result = handler(msg.payload, msg);
          } catch (err) {
            safeCall(function () { throw err; }, [], "bus:" + name);
            runOne();
            return;
          }

          // Await promise completion before continuing the queue (if handler returned one)
          if (result && typeof result.then === "function") {
            result.then(
              function () { runOne(); },
              function (err) {
                safeCall(function () { throw err; }, [], "bus:" + name);
                runOne();
              }
            );
            return;
          }
          runOne();
          return;
        }

        if (msg._resolve) msg._resolve(msg);
        Promise.resolve().then(next);
      }

      runOne();
    }
    next();
  }

  /**
   * Publishes a message to a specific bus channel.
   * 
   * @alias send
   * @memberof module:lean-state.bus
   * @param {string} channel - The destination channel name.
   * @param {Object} [message] - The payload to send.
   * @returns {Promise<BusMessage>} A promise that resolves when all subscribers have processed the message.
   */
  function busSend(channel, message) {
    var payload = message || {};
    broadcastLocalMessage(channel, payload);

    var ch = ensureChannel(channel);
    ch.sequence += 1;
    
    var envelope = {
      id: resolved._runtime + "-" + Date.now().toString(36) + "-" + ch.sequence,
      runtime: resolved._runtime,
      channel: channel,
      timestamp: Date.now(),
      sequence: ch.sequence,
      payload: payload,
    };
    
    return new Promise(function (resolve) {
      envelope._resolve = resolve;
      ch.queue.push(envelope);
      processChannel(channel);
    });
  }

  /**
   * Subscribes a handler to a specific bus channel.
   * 
   * @alias subscribe
   * @memberof module:lean-state.bus
   * @param {string} channel - The channel to listen to.
   * @param {function(Object, BusMessage): (void|Promise)} handler - The callback to execute when a message arrives.
   * @param {BusOptions} [options] - Liveness context and memory management settings.
   * @returns {function(): void} An unsubscribe function.
   */
  function busSubscribe(channel, handler, options) {
    if (typeof handler !== "function") return function () {};
    options = options || {};

    var context = options.context !== undefined ? options.context : global;
    var useWeak = options.weak === true && HAS_WEAKREF;

    if (resolved.handshake && !isContextAlive(context)) {
      log("subscribe rejected; context already dead", channel);
      return function () {};
    }

    var sub = {
      handler: useWeak ? null : handler,
      handlerRef: useWeak ? new WeakRef(handler) : null,
      context: context,
      channel: channel,
      dead: false,
      timer: null,
    };

    ensureChannel(channel).subscribers.add(sub);

    return function unsubscribe() {
      dropSubscription(sub);
    };
  }

  // Hook into native environment events to eagerly prune memory
  if (typeof global.addEventListener === "function") {
    global.addEventListener("visibilitychange", function () {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        busPrune();
      }
    });
    global.addEventListener("focus", function () {
      busPrune();
    });
  }

  // ===========================================================================
  // Public API Export
  // ===========================================================================

  /**
   * Gets or merges the application configuration.
   * 
   * @memberof module:lean-state
   * @param {Object} [options] - New configuration values to apply.
   * @returns {LeanStateConfig} The active configuration.
   */
  function config(options) {
    if (options == null) {
      var r = resolved;
      return {
        app: r.app,
        namespace: r.namespace,
        scope: r.scope,
        storage: r.storage,
        throttle: r.throttle,
        debug: r.debug,
        handshake: r.handshake,
        heartbeat: r.heartbeat,
        bridgeChannel: r.bridgeChannel,
      };
    }

    if (typeof options !== "object") return config();
    
    Object.keys(options).forEach(function (k) {
      if (k in DEFAULTS || k === "namespace") userConfig[k] = options[k];
    });
    
    var prevRuntime = resolved._runtime;
    var prevBeat = resolved.heartbeat;
    var prevBridgeChannel = resolved.bridgeChannel;

    resolved = computeResolved();

    if (resolved._runtime !== prevRuntime) {
      memoryState = Object.create(null);
      hydrateFromStorage();
    }
    if (resolved.heartbeat !== prevBeat) ensureGlobalHeartbeat();
    if (resolved.bridgeChannel !== prevBridgeChannel) setupBridge();

    log("config updated", config());
    return config();
  }

  /**
   * Retrieves the generated application identity and runtimes.
   * @alias identity
   * @memberof module:lean-state
   * @returns {LeanStateIdentity}
   */
  function getIdentity() {
    return {
      app: resolved.app,
      namespace: resolved.namespace,
      instance: resolved._rawInstance,
      runtime: resolved._runtime,
    };
  }

  /**
   * Forcefully shuts down the library, flushes storage, and clears queues/timers.
   * Used automatically on page unload.
   * @private
   */
  function destroy() {
    if (persistTimer != null) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    if (globalHeartbeatTimer != null) {
      clearInterval(globalHeartbeatTimer);
      globalHeartbeatTimer = null;
    }
    if (bridge) {
      try { bridge.close(); } catch (_) {}
      bridge = null;
    }
    
    flushPersistAndNotify();
    
    Object.keys(channels).forEach(function (name) {
      Array.from(channels[name].subscribers).forEach(dropSubscription);
      channels[name].queue = [];
    });
    
    channels = Object.create(null);
    keySubscribers = Object.create(null);
    log("destroyed");
  }

  if (typeof global.addEventListener === "function") {
    global.addEventListener("beforeunload", destroy);
    global.addEventListener("pagehide", destroy);
  }

  /**
   * @namespace bus
   * @memberof module:lean-state
   * @description Cross-tab message bus and event subscription manager.
   */
  var leanState = {
    config: config,
    get: get,
    set: set,
    remove: remove,
    has: has,
    subscribe: subscribeState,
    bus: {
      send: busSend,
      subscribe: busSubscribe,
      prune: busPrune,
    },
    get identity() {
      return getIdentity();
    },
    version: "1.3.0",
    _onError: null,
    _destroy: destroy,
    _isContextAlive: isContextAlive,
  };

  hydrateFromStorage();

  // Expose globally
  if (!global.leanState) {
    global.leanState = leanState;
  } else {
    log("leanState already present, skipping re-init");
  }

  // CommonJS export if applicable
  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.leanState;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);