import { useMessageBar, type MessageBarType } from '../../context/MessageBarContext';

const STATE_STYLES: Record<
  MessageBarType,
  { bar: string; dot: string; text: string }
> = {
  idle:    { bar: 'bg-[#0D0D0D] border-[#222222]',                           dot: '',          text: 'text-[#555555]' },
  info:    { bar: 'border-[rgba(77,159,255,.55)]',                            dot: 'bg-[#4D9FFF]', text: 'text-[#4D9FFF]' },
  warning: { bar: 'border-[rgba(240,165,0,.55)]',                             dot: 'bg-[#F0A500]', text: 'text-[#F0A500]' },
  error:   { bar: 'bg-[rgba(204,0,0,.18)] border-[#CC0000]',                 dot: 'bg-[#CC0000]', text: 'text-[#FF5B5B]' },
  success: { bar: 'bg-[rgba(95,209,139,.12)] border-[rgba(95,209,139,.40)]', dot: 'bg-[#5FD18B]', text: 'text-[#5FD18B]' },
};

interface MessageBarProps {
  /** standalone login variant: 84px tall, pinned at the bottom of the login screen */
  standalone?: boolean;
}

/**
 * Displays the current message from MessageBarContext.
 * Color, dot, and text styling are keyed by message type (idle/info/warning/error/success).
 *
 * In "idle" state, shows a dim placeholder text.
 * In all other states, shows a colored status dot followed by the message text.
 *
 * @param standalone - When true, renders as an 84px bar with top border (used on login/PIN screens);
 *   default false renders as a 74px bar with bottom border (used inside the app shell)
 */
export function MessageBar({ standalone = false }: MessageBarProps) {
  const { message } = useMessageBar();
  const s = STATE_STYLES[message.type];

  const height = standalone ? 'h-[84px]' : 'h-[74px]';
  const border = standalone ? 'border-t-2' : 'border-b-2';
  const bgDefault = message.type === 'idle' ? 'bg-[#0D0D0D]' : '';

  return (
    <div
      className={`shrink-0 flex items-center gap-3 px-8 ${height} ${border} ${bgDefault} ${s.bar}`}
    >
      {message.type !== 'idle' && (
        <span className={`shrink-0 w-3 h-3 rounded-full ${s.dot}`} />
      )}
      <span className={`font-ui text-[27px] font-normal ${s.text}`}>
        {message.type === 'idle' ? 'status messages appear here' : message.text}
      </span>
    </div>
  );
}
