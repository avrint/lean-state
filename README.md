# Lean State
Zero-import application kernel.

## API Reference

<!-- START API -->

<a name="module_lean-state"></a>

## lean-state
Zero-import application kernel: identity, configuration, state management, 
message bus, and cross-tab bridge. Attaches globally to `window.leanState`.

**Version**: 1.3.0  

* [lean-state](#module_lean-state)
    * [subscribe(key, handler)](#subscribe) ⇒ <code>function</code>
    * [identity()](#identity) ⇒ <code>LeanStateIdentity</code>
    * _static_
        * [.bus](#module_lean-state.bus) : <code>object</code>
            * [prune()](#prune) ⇒ <code>number</code>
            * [send(channel, [message])](#send) ⇒ <code>Promise.&lt;BusMessage&gt;</code>
            * [subscribe(channel, handler, [options])](#subscribe) ⇒ <code>function</code>
        * [.get(key)](#module_lean-state.get) ⇒ <code>\*</code>
        * [.set(key, value, [options])](#module_lean-state.set) ⇒ <code>\*</code>
        * [.remove(key)](#module_lean-state.remove)
        * [.has(key)](#module_lean-state.has) ⇒ <code>boolean</code>
        * [.config([options])](#module_lean-state.config) ⇒ <code>LeanStateConfig</code>
    * _inner_
        * [~LeanStateConfig](#module_lean-state..LeanStateConfig) : <code>Object</code>
        * [~LeanStateIdentity](#module_lean-state..LeanStateIdentity) : <code>Object</code>
        * [~StateOptions](#module_lean-state..StateOptions) : <code>Object</code>
        * [~BusOptions](#module_lean-state..BusOptions) : <code>Object</code>
        * [~BusMessage](#module_lean-state..BusMessage) : <code>Object</code>
        * [~StorageAdapter](#module_lean-state..StorageAdapter) : <code>Object</code>

<a name="subscribe"></a>

### lean-statesubscribe(key, handler) ⇒ <code>function</code>
Subscribes to changes on a specific state key.

**Returns**: <code>function</code> - An unsubscribe function to stop watching.  

| Param | Type | Description |
| --- | --- | --- |
| key | <code>string</code> | The state key to watch. |
| handler | <code>function</code> | Callback invoked when the key changes. |

<a name="identity"></a>

### lean-stateidentity() ⇒ <code>LeanStateIdentity</code>
Retrieves the generated application identity and runtimes.

<a name="module_lean-state.bus"></a>

### lean-state.bus : <code>object</code>
Cross-tab message bus and event subscription manager.

**Kind**: static namespace of [<code>lean-state</code>](#module_lean-state)  

* [.bus](#module_lean-state.bus) : <code>object</code>
    * [prune()](#prune) ⇒ <code>number</code>
    * [send(channel, [message])](#send) ⇒ <code>Promise.&lt;BusMessage&gt;</code>
    * [subscribe(channel, handler, [options])](#subscribe) ⇒ <code>function</code>

<a name="prune"></a>

#### busprune() ⇒ <code>number</code>
Triggers a manual garbage collection sweep across all bus channels.

**Returns**: <code>number</code> - The total number of dead subscriptions dropped.  
<a name="send"></a>

#### bussend(channel, [message]) ⇒ <code>Promise.&lt;BusMessage&gt;</code>
Publishes a message to a specific bus channel.

**Returns**: <code>Promise.&lt;BusMessage&gt;</code> - A promise that resolves when all subscribers have processed the message.  

| Param | Type | Description |
| --- | --- | --- |
| channel | <code>string</code> | The destination channel name. |
| [message] | <code>Object</code> | The payload to send. |

<a name="subscribe"></a>

#### bussubscribe(channel, handler, [options]) ⇒ <code>function</code>
Subscribes a handler to a specific bus channel.

**Returns**: <code>function</code> - An unsubscribe function.  

| Param | Type | Description |
| --- | --- | --- |
| channel | <code>string</code> | The channel to listen to. |
| handler | <code>function</code> | The callback to execute when a message arrives. |
| [options] | <code>BusOptions</code> | Liveness context and memory management settings. |

<a name="module_lean-state.get"></a>

### lean-state.get(key) ⇒ <code>\*</code>
Retrieves a value from the application state.

**Kind**: static method of [<code>lean-state</code>](#module_lean-state)  
**Returns**: <code>\*</code> - The stored value, or undefined if not found.  

| Param | Type | Description |
| --- | --- | --- |
| key | <code>string</code> | The state key to retrieve. |

<a name="module_lean-state.set"></a>

### lean-state.set(key, value, [options]) ⇒ <code>\*</code>
Sets a value in the application state and schedules persistence/notification.

**Kind**: static method of [<code>lean-state</code>](#module_lean-state)  
**Returns**: <code>\*</code> - The value that was set.  

| Param | Type | Description |
| --- | --- | --- |
| key | <code>string</code> | The state key to set. |
| value | <code>\*</code> | The value to store. |
| [options] | <code>StateOptions</code> | Storage duration options. |

<a name="module_lean-state.remove"></a>

### lean-state.remove(key)
Removes a key from the application state.

**Kind**: static method of [<code>lean-state</code>](#module_lean-state)  

| Param | Type | Description |
| --- | --- | --- |
| key | <code>string</code> | The state key to remove. |

<a name="module_lean-state.has"></a>

### lean-state.has(key) ⇒ <code>boolean</code>
Checks if a key exists in the application state.

**Kind**: static method of [<code>lean-state</code>](#module_lean-state)  
**Returns**: <code>boolean</code> - True if the key exists, false otherwise.  

| Param | Type | Description |
| --- | --- | --- |
| key | <code>string</code> | The state key to verify. |

<a name="module_lean-state.config"></a>

### lean-state.config([options]) ⇒ <code>LeanStateConfig</code>
Gets or merges the application configuration.

**Kind**: static method of [<code>lean-state</code>](#module_lean-state)  
**Returns**: <code>LeanStateConfig</code> - The active configuration.  

| Param | Type | Description |
| --- | --- | --- |
| [options] | <code>Object</code> | New configuration values to apply. |

<a name="module_lean-state..LeanStateConfig"></a>

### lean-state~LeanStateConfig : <code>Object</code>
**Kind**: inner typedef of [<code>lean-state</code>](#module_lean-state)  
**Properties**

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| [app] | <code>string</code> | <code>&quot;&#x27;lean-app&#x27;&quot;</code> | The global application identifier. |
| [namespace] | <code>string</code> | <code>&quot;&#x27;default&#x27;&quot;</code> | Namespace for isolating state/bus within the app. |
| [scope] | <code>&#x27;window&#x27;</code> \| <code>&#x27;app&#x27;</code> | <code>&#x27;window&#x27;</code> | Instance scope ('window' isolates to the tab, 'app' shares identity). |
| [storage] | <code>&#x27;auto&#x27;</code> \| <code>&#x27;memory&#x27;</code> \| <code>&#x27;local&#x27;</code> \| <code>&#x27;session&#x27;</code> | <code>&#x27;auto&#x27;</code> | Preferred storage backend. |
| [throttle] | <code>number</code> | <code>420</code> | Milliseconds to throttle persistence writes. |
| [debug] | <code>boolean</code> | <code>false</code> | Enable internal console logging. |
| [handshake] | <code>boolean</code> | <code>true</code> | Ensure context is alive before processing subscriptions. |
| [heartbeat] | <code>number</code> | <code>30000</code> | Interval (ms) to prune dead bus subscribers. |
| [bridgeChannel] | <code>string</code> | <code>&quot;&#x27;lean-app&#x27;&quot;</code> | BroadcastChannel name for cross-tab communication. |

<a name="module_lean-state..LeanStateIdentity"></a>

### lean-state~LeanStateIdentity : <code>Object</code>
**Kind**: inner typedef of [<code>lean-state</code>](#module_lean-state)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| app | <code>string</code> | The configured application identifier. |
| namespace | <code>string</code> | The configured namespace. |
| instance | <code>string</code> | The raw instance ID (e.g., tab-specific token). |
| runtime | <code>string</code> | The deterministically hashed runtime ID. |

<a name="module_lean-state..StateOptions"></a>

### lean-state~StateOptions : <code>Object</code>
**Kind**: inner typedef of [<code>lean-state</code>](#module_lean-state)  
**Properties**

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| [persistence] | <code>&#x27;transient&#x27;</code> \| <code>&#x27;session&#x27;</code> \| <code>&#x27;persistent&#x27;</code> | <code>&#x27;transient&#x27;</code> | Storage duration. |

<a name="module_lean-state..BusOptions"></a>

### lean-state~BusOptions : <code>Object</code>
**Kind**: inner typedef of [<code>lean-state</code>](#module_lean-state)  
**Properties**

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| [context] | <code>Object</code> \| <code>Window</code> \| <code>Document</code> \| <code>Node</code> \| <code>function</code> | <code>global</code> | DOM node or object to test for liveness. |
| [weak] | <code>boolean</code> | <code>false</code> | Use WeakRef for the handler to allow garbage collection. |

<a name="module_lean-state..BusMessage"></a>

### lean-state~BusMessage : <code>Object</code>
**Kind**: inner typedef of [<code>lean-state</code>](#module_lean-state)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | Unique message envelope ID. |
| runtime | <code>string</code> | The runtime ID of the sender. |
| channel | <code>string</code> | The channel the message was published on. |
| timestamp | <code>number</code> | Epoch timestamp of when the message was sent. |
| sequence | <code>number</code> | The sequence number within the channel. |
| payload | <code>Object</code> | The user-defined message payload. |
| [_resolve] | <code>function</code> | Internal promise resolver. |

<a name="module_lean-state..StorageAdapter"></a>

### lean-state~StorageAdapter : <code>Object</code>
**Kind**: inner typedef of [<code>lean-state</code>](#module_lean-state)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| type | <code>string</code> | Identifier for the storage type ('memory', 'local', 'session'). |
| getItem | <code>function</code> | Retrieves an item. |
| setItem | <code>function</code> | Stores an item. |
| removeItem | <code>function</code> | Deletes an item. |
| key | <code>function</code> | Retrieves a key by index. |
| length | <code>number</code> | Number of items in storage. |


<!-- END API -->