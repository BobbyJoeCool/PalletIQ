import { ModalOverlay } from './ModalOverlay';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
  /** Extra amber warning line below the message, e.g. "requires an Inventory Manager or
   *  above" — for when `showConfirm` is also false, explaining why. */
  note?: string;
  /** Hides the Confirm button, leaving only Cancel (full width) — for a caller whose
   *  confirm action is conditionally unavailable (e.g. MNP's combine-pallets dialog when
   *  the current worker isn't IM+) rather than always offering both choices. */
  showConfirm?: boolean;
}

/**
 * Full-screen modal that requires an explicit Confirm/Cancel choice before a
 * destructive or hard-to-reverse action proceeds. Matches the overlay style shared by
 * every other blocking dialog in the app (dark backdrop, centered rounded card) via
 * `ModalOverlay`.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  onConfirm,
  onCancel,
  note,
  showConfirm = true,
}: ConfirmDialogProps) {
  const confirmStyles =
    variant === 'danger'
      ? 'bg-[#CC0000] hover:bg-[#AA0000]'
      : 'bg-[#003366] hover:bg-[#004488]';

  return (
    <ModalOverlay width="w-[480px]">
      <h2 className="font-ui text-[24px] font-semibold text-white text-center mb-3">
        {title}
      </h2>
      {/* whitespace-pre-line: a caller can build a multi-line message with literal `\n`
          separators (e.g. PAR's create-summary dialog) and have each line render on its
          own row instead of collapsing to a single space, HTML's own default whitespace
          behavior. A no-`\n` message (every other current caller) renders identically to
          before. */}
      <p className="font-ui text-[17px] text-[#9A9A9A] text-center mb-7 whitespace-pre-line">
        {message}
      </p>
      {note && (
        <p className="font-ui text-[14px] text-[#AA6600] text-center mb-5">
          {note}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 h-[64px] rounded-[12px] border border-[#3A3A3A] font-ui text-[19px] font-medium text-white hover:bg-[#1A1A1A] active:bg-[#262626] transition-colors"
        >
          {cancelLabel}
        </button>
        {showConfirm && (
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 h-[64px] rounded-[12px] font-ui text-[19px] font-semibold text-white transition-colors ${confirmStyles}`}
          >
            {confirmLabel}
          </button>
        )}
      </div>
    </ModalOverlay>
  );
}
