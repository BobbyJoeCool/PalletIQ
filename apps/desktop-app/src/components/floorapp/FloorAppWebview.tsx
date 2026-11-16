import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/authContext';

/**
 * Channel names shared with the guest preload (electron/floorAppPreload.cts), which
 * compiles separately and so repeats them.
 */
const REQUEST_SESSION_CHANNEL = 'palletiq:request-session';
const SESSION_CHANNEL = 'palletiq:session';

/** Chromium's "load was aborted" code — fired on ordinary redirects, not a real failure. */
const ERR_ABORTED = -3;

/** The parts of Electron's `<webview>` element this component calls. */
interface WebviewControls {
  send: (channel: string, ...args: unknown[]) => Promise<void>;
  reload: () => void;
}

/**
 * @param element - the mounted `<webview>` element
 * @returns true if it has Electron's webview methods (it does not in a plain browser)
 */
function hasWebviewControls<T extends HTMLElement>(element: T): element is T & WebviewControls {
  return 'send' in element && 'reload' in element;
}

/**
 * @param event - an event dispatched by the webview
 * @returns true if it is a message the guest page sent to this host
 */
function isGuestMessage(event: Event): event is Event & { channel: string } {
  return 'channel' in event && typeof event.channel === 'string';
}

/**
 * @param event - an event dispatched by the webview
 * @returns true if it reports a failed load carrying an error code
 */
function isLoadFailure(event: Event): event is Event & { errorCode: number; isMainFrame: boolean } {
  return 'errorCode' in event && typeof event.errorCode === 'number' && 'isMainFrame' in event;
}

interface FloorAppWebviewProps {
  /** URL of the floor app build to embed. */
  url: string;
  /** Whether the window is on screen — keyboard focus follows it. */
  visible: boolean;
}

/**
 * The embedded floor app itself (#141): an Electron `<webview>` running the existing
 * floor-app build in its own process. Two jobs beyond showing it:
 *
 *   - Session handoff. When the floor app asks for a session, it is sent this app's
 *     current token and user, which is how it signs in without a badge/PIN.
 *   - Reporting an unreachable floor app, with a Retry, rather than a blank window.
 *
 * It stays mounted while hidden; that is what preserves the floor app's place.
 */
export function FloorAppWebview({ url, visible }: FloorAppWebviewProps) {
  const { token, user } = useAuth();
  const webviewRef = useRef<HTMLWebViewElement>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  // Answer the guest's session requests with the current session.
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview || !token || !user) return;

    /** Replies to a session request from the floor app; ignores any other message. */
    function onGuestMessage(event: Event) {
      if (!isGuestMessage(event) || event.channel !== REQUEST_SESSION_CHANNEL) return;
      if (webview && hasWebviewControls(webview)) {
        void webview.send(SESSION_CHANNEL, { token, user });
      }
    }

    webview.addEventListener('ipc-message', onGuestMessage);
    return () => webview.removeEventListener('ipc-message', onGuestMessage);
  }, [token, user]);

  // Track whether the floor app could be loaded.
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    function onFailLoad(event: Event) {
      if (isLoadFailure(event) && event.isMainFrame && event.errorCode !== ERR_ABORTED) {
        setLoadFailed(true);
      }
    }
    function onStartLoading() {
      setLoadFailed(false);
    }

    webview.addEventListener('did-fail-load', onFailLoad);
    webview.addEventListener('did-start-loading', onStartLoading);
    return () => {
      webview.removeEventListener('did-fail-load', onFailLoad);
      webview.removeEventListener('did-start-loading', onStartLoading);
    };
  }, []);

  // Typing should land in the floor app as soon as its window is shown.
  useEffect(() => {
    if (visible) webviewRef.current?.focus();
  }, [visible]);

  /** Reloads the floor app after a failed load. */
  function retry() {
    const webview = webviewRef.current;
    if (webview && hasWebviewControls(webview)) webview.reload();
  }

  return (
    <div className="relative h-full w-full bg-black">
      <webview ref={webviewRef} src={url} className="flex h-full w-full" />

      {loadFailed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[var(--surface-1)] p-6 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            The floor app could not be reached at{' '}
            <span className="font-[family-name:var(--font-data)]">{url}</span>.
          </p>
          <button
            type="button"
            onClick={retry}
            className="h-9 rounded-md bg-[var(--red-primary)] px-4 text-sm font-semibold text-white hover:opacity-90"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
