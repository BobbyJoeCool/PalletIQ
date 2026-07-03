interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Full-screen modal that requires an explicit Confirm/Cancel choice before a
 * destructive or hard-to-reverse action proceeds. Matches the overlay style used
 * by MNP's LevelModal (dark backdrop, centered rounded card).
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmStyles =
    variant === 'danger'
      ? 'bg-[#CC0000] hover:bg-[#AA0000]'
      : 'bg-[#003366] hover:bg-[#004488]';

  return (
    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-[#0D0D0D] border border-[#2A2A2A] rounded-[20px] p-8 w-[480px] shadow-2xl">
        <h2 className="font-ui text-[24px] font-semibold text-white text-center mb-3">
          {title}
        </h2>
        <p className="font-ui text-[17px] text-[#9A9A9A] text-center mb-7">
          {message}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 h-[64px] rounded-[12px] border border-[#3A3A3A] font-ui text-[19px] font-medium text-white hover:bg-[#1A1A1A] active:bg-[#262626] transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 h-[64px] rounded-[12px] font-ui text-[19px] font-semibold text-white transition-colors ${confirmStyles}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
