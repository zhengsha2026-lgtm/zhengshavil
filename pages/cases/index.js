import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { useUser } from '@/components/UserContext';
import { createClient } from '@/lib/supabaseBrowser';
import { PAGE_SIZE } from '@/lib/constants';
import { escapeSearchKeyword } from '@/lib/api';
import Pagination from '@/components/Pagination';
import { LoadingPage, EmptyState } from '@/components/Feedback';

const initialFilters = { q: '', status: '' };

export default function CasesPage() {
  const { isAdmin } = useUser();
  const [filters, setFilters] = useState(initialFilters);
  const [debouncedQ, setDebouncedQ] = useState('');
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const firstLoadRef = useRef(true);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(filters.q), 400);
    return () => clearTimeout(timer);
  }, [filters.q]);

  const set = (field, value) => setFilters((f) => ({ ...f, [field]: value }));

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      let query = supabase.from('cases').select('*, inspections(count)', { count: 'exact' });

      if (filters.status) query = query.eq('status', filters.status);
      const kw = escapeSearchKeyword(debouncedQ);
      if (kw) {
        query = query.or(`title.ilike.%${kw}%,location.ilike.%${kw}%,description.ilike.%${kw}%`);
      }

      query = query
        .order('created_at', { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      const { data: rows, error: queryError, count } = await query;
      if (queryError) throw queryError;
      setData(rows || []);
      setTotal(count || 0);
    } catch (err) {
      setError(err.message || '載入失敗');
    } finally {
      setLoading(false);
      firstLoadRef.current = false;
    }
  }, [filters.status, debouncedQ, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setPage(1);
  }, [filters.status, debouncedQ]);

  const hasActiveFilter = filters.q || filters.status;

  return (
    <Layout title="案件紀錄">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-800">案件紀錄</h1>
          <p className="mt-0.5 text-xs text-gray-400">以案件為單位管理會勘，單次或多次會勘皆可</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Link href="/inspections/new?from=list" className="btn-secondary !px-3.5 !py-2 text-sm">
              新增會勘
            </Link>
            <Link href="/cases/new" className="btn-primary !px-3.5 !py-2 text-sm sm:!px-4">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              新增案件
            </Link>
          </div>
        )}
      </div>

      {/* 篩選器 */}
      <div className="card mb-4 border-gray-100 bg-gray-50/80 p-4">
        <div className="relative">
          <svg
            className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
          </svg>
          <input
            type="search"
            className="input pl-10"
            placeholder="搜尋案件名稱、地點或說明"
            value={filters.q}
            onChange={(e) => set('q', e.target.value)}
          />
        </div>

        <div className="mt-3 flex gap-2">
          {[
            { value: '', label: '全部' },
            { value: 'in_progress', label: '進行中' },
            { value: 'completed', label: '已結案' },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => set('status', opt.value)}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                filters.status === opt.value
                  ? 'bg-accent-600 text-white'
                  : 'bg-white text-gray-500 ring-1 ring-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {hasActiveFilter && (
          <button
            type="button"
            onClick={() => setFilters(initialFilters)}
            className="mt-3 text-xs font-medium text-accent-600 hover:text-accent-700"
          >
            清除篩選條件
          </button>
        )}
      </div>

      {/* 清單 */}
      {loading && firstLoadRef.current ? (
        <LoadingPage text="載入案件資料…" />
      ) : error ? (
        <div className="card px-4 py-10 text-center text-sm text-red-600">{error}</div>
      ) : data.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<EmptyIconFallback />}
            title={hasActiveFilter ? '沒有符合篩選條件的案件' : '尚無案件'}
            description={hasActiveFilter ? '請調整篩選條件後再試' : '管理員可以從右上角新增第一筆案件'}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((item) => (
            <Link
              key={item.id}
              href={`/cases/${item.id}`}
              className="card card-bar card-bar-indigo block p-4 transition-shadow hover:shadow-soft"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-[15px] font-bold text-gray-800">{item.title}</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span
                      className={`info-tag ${
                        item.status === 'in_progress'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {item.status === 'in_progress' ? '進行中' : '已結案'}
                    </span>
                    <span className="info-tag bg-teal-50 text-teal-700">
                      會勘 {item.inspections?.[0]?.count ?? 0} 次
                    </span>
                  </div>
                  {item.location && (
                    <p className="mt-2 max-w-[220px] truncate text-xs text-gray-500">📍 {item.location}</p>
                  )}
                </div>
                <svg className="mt-1 h-4 w-4 shrink-0 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      )}

      {!loading && !error && total > 0 && (
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
      )}
    </Layout>
  );
}

function EmptyIconFallback() {
  return (
    <svg className="h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
      />
    </svg>
  );
}
