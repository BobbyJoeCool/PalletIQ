import { createContext, useContext, useState } from 'react';

export type MessageBarType = 'idle' | 'info' | 'warning' | 'error' | 'success';

export interface MessageBarState {
  type: MessageBarType;
  text: string;
}

interface MessageBarContextValue {
  message: MessageBarState;
  setMessage: (msg: MessageBarState) => void;
  clearMessage: () => void;
}

const IDLE: MessageBarState = { type: 'idle', text: '' };

const MessageBarContext = createContext<MessageBarContextValue | null>(null);

/**
 * Provides a single persistent message bar state to the app shell and login screens.
 * Only one message is displayed at a time; calling setMessage replaces any prior message.
 * The MessageBar component reads this state and renders the appropriate color and icon.
 *
 * The login and PIN screens use their own isolated MessageBarProvider so their errors
 * don't bleed into the app shell's message bar after login.
 */
export function MessageBarProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessageState] = useState<MessageBarState>(IDLE);

  /** Replaces the current message bar state with a new one. */
  const setMessage = (msg: MessageBarState) => setMessageState(msg);
  /** Resets the message bar back to its idle placeholder state. */
  const clearMessage = () => setMessageState(IDLE);

  return (
    <MessageBarContext.Provider value={{ message, setMessage, clearMessage }}>
      {children}
    </MessageBarContext.Provider>
  );
}

/**
 * Hook that returns `{ message, setMessage, clearMessage }` from the nearest MessageBarProvider.
 * Must be called inside a MessageBarProvider; throws if used outside.
 */
export function useMessageBar(): MessageBarContextValue {
  const ctx = useContext(MessageBarContext);
  if (!ctx) throw new Error('useMessageBar must be used inside MessageBarProvider');
  return ctx;
}
