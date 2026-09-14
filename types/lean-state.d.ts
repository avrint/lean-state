/**
 * @module lean-state
 * @description Zero-import application kernel: identity, configuration, state management,
 * message bus, and cross-tab bridge. Attaches globally to `window.leanState`.
 * @version 1.3.0
 */
declare const leanState: {
    config: (options?: Object) => {
        app?: string;
        namespace?: string;
        scope?: 'window' | 'app';
        storage?: 'auto' | 'memory' | 'local' | 'session';
        throttle?: number;
        debug?: boolean;
        handshake?: boolean;
        heartbeat?: number;
        bridgeChannel?: string;
    };
    get: (key: string) => any;
    set: (key: string, value: any, options?: {
        persistence?: 'transient' | 'session' | 'persistent';
    }) => any;
    remove: (key: string) => void;
    has: (key: string) => boolean;
    subscribe: (key: string, handler: Function) => Function;
    bus: {
        send: (channel: string, message?: Object) => Promise<{
            id: string;
            runtime: string;
            channel: string;
            timestamp: number;
            sequence: number;
            payload: Object;
            _resolve?: Function | undefined;
        }>;
        on: (channel: string, handler: Function, options?: {
            context?: Object | Window | Document | Node | Function;
            weak?: boolean;
        }) => Function;
        prune: () => number;
    };
    readonly identity: {
        app: string;
        namespace: string;
        instance: string;
        runtime: string;
    };
    version: string;
    _onError: null;
    _destroy: () => void;
    _isContextAlive: (context: any) => boolean;
};
export = leanState;

type LeanState = typeof leanState;

declare global {
  interface Window {
    leanState: LeanState;
  }
  var leanState: LeanState;
}
