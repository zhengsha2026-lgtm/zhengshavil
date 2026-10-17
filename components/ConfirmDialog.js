import { useEffect } from 'react';

export default function ConfirmDialog({
  open,
  title = '確認操作',
  message,
  confirmText = '確定',
  cancelText = '取消',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onCancel?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={() => !busy && onCancel?.()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="card w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-gray-800">{title}</h3>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-500">{message}</p>
        <div className="mt-5 flex gap-2.5">
          <button type="button" className="btn-secondary flex-1" onClick={onCancel} disabled={busy}>
            {cancelText}
          </button>
          <button
            type="button"
            className={`${danger ? 'btn-danger' : 'btn-primary'} flex-1`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? '處理中…' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
