export default function Spinner({ className = 'h-6 w-6' }) {
  return (
    <svg className={`animate-spin text-accent-500 ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export function LoadingPage({ text = '載入中…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-gray-500">
      <Spinner className="h-8 w-8" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

export function EmptyState({ icon = '📭', title = '沒有資料', description = '' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-gray-400">
      <span className="text-4xl">{icon}</span>
      <p className="text-sm font-medium text-gray-500">{title}</p>
      {description && <p className="text-xs">{description}</p>}
    </div>
  );
}

export function ErrorState({ message = '載入失敗，請稍後再試', onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <span className="text-4xl">⚠️</span>
      <p className="text-sm font-medium text-gray-600">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-secondary">
          重試
        </button>
      )}
    </div>
  );
}

export function AccessDenied({ message = '此功能僅限管理員使用' }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-16 text-center">
      <span className="text-4xl">🔒</span>
      <p className="text-sm font-medium text-gray-600">{message}</p>
      <p className="text-xs text-gray-400">如需新增或修改資料，請聯絡里辦公室管理員</p>
    </div>
  );
}
