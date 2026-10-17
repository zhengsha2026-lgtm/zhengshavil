export default function Pagination({ page, pageSize, total, onChange }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;

  const pages = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);
  for (let i = Math.max(1, end - 4); i <= end; i++) pages.push(i);

  return (
    <nav className="flex items-center justify-center gap-1.5 py-2" aria-label="分頁">
      <button
        type="button"
        className="btn-secondary !px-3 !py-2"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        上一頁
      </button>
      {pages[0] > 1 && <span className="px-1 text-sm text-gray-400">…</span>}
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={`h-9 w-9 rounded-xl text-sm font-medium transition-colors ${
            p === page
              ? 'bg-accent-600 text-white'
              : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          {p}
        </button>
      ))}
      {pages[pages.length - 1] < totalPages && <span className="px-1 text-sm text-gray-400">…</span>}
      <button
        type="button"
        className="btn-secondary !px-3 !py-2"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        下一頁
      </button>
      <span className="ml-2 hidden text-xs text-gray-400 sm:inline">
        第 {page} / {totalPages} 頁，共 {total} 筆
      </span>
    </nav>
  );
}
