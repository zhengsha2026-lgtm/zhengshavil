import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { useUser } from '@/components/UserContext';
import { createClient } from '@/lib/supabaseBrowser';
import { PAGE_SIZE } from '@/lib/constants';
import { formatDate } from '@/lib/format';
import { escapeSearchKeyword } from '@/lib/api';
import Pagination from '@/components/Pagination';
import { LoadingPage, EmptyState } from '@/components/Feedback';

const initialFilters = { dateFrom: '', dateTo: '', q: '' };

export default function InspectionsPage() {
  const { isAdmin } = useUser();
  const [filters, setFilters] = useState(initialFilters);
  const [debouncedQ, setDebouncedQ] = useState('');
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const firstLoadRef = useRef(true);

  // 關鍵字 debounce
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
      let query = supabase
        .from('inspections')
        .select('*, cases(id, title)', { count: 'exact' });

      if (filters.dateFrom) query = query.gte('inspection_date', filters.dateFrom);
      if (filters.dateTo) query = query.lte('inspection_date', filters.dateTo);
      const kw = escapeSearchKeyword(debouncedQ);
      if (kw) {
        query = query.or(
          `title.ilike.%${kw}%,location.ilike.%${kw}%,participants.ilike.%${kw}%,description.ilike.%${kw}%`
        );
      }

      query = query
        .order('inspection_date', { ascending: false, nullsFirst: false })
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
  }, [filters.dateFrom, filters.dateTo, debouncedQ, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 切換篩選條件時回到第一頁
  useEffect(() => {
    setPage(1);
  }, [filters.dateFrom, filters.dateTo, debouncedQ]);

  const hasActiveFilter = filters.dateFrom || filters.dateTo || filters.q;

  return (
    <Layout title="會勘紀錄">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-800">會勘紀錄</h1>
          <p className="mt-0.5 text-xs text-gray-400">現場勘查紀錄，可關聯工作追蹤處理</p>
        </div>
        {isAdmin && (
          <Link href="/inspections/new" className="btn-primary !px-3.5 !py-2 text-sm sm:!px-4">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            新增會勘
          </Link>
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
            placeholder="搜尋標題、地點、人員或說明"
            value={filters.q}
            onChange={(e) => set('q', e.target.value)}
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <input
            type="date"
            className="input"
            value={filters.dateFrom}
            onChange={(e) => set('dateFrom', e.target.value)}
            aria-label="會勘日期起"
          />
          <input
            type="date"
            className="input"
            value={filters.dateTo}
            onChange={(e) => set('dateTo', e.target.value)}
            aria-label="會勘日期迄"
          />
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
        <LoadingPage text="載入會勘資料…" />
      ) : error ? (
        <div className="card px-4 py-10 text-center text-sm text-red-600">{error}</div>
      ) : data.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<EmptyIconFallback />}
            title={hasActiveFilter ? '沒有符合篩選條件的會勘紀錄' : '尚無會勘紀錄'}
            description={hasActiveFilter ? '請調整篩選條件後再試' : '管理員可以從右上角新增第一筆會勘紀錄'}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((item) => (
            <Link
              key={item.id}
              href={`/inspections/${item.id}`}
              className="card card-bar card-bar-teal block p-4 transition-shadow hover:shadow-soft"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-[15px] font-bold text-gray-800">{item.title}</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="info-tag bg-teal-50 text-teal-700">{formatDate(item.inspection_date)}</span>
                    {item.stage && <span className="info-tag bg-teal-50 text-teal-700">{item.stage}</span>}
                    {item.cases ? (
                      <span className="max-w-full truncate info-tag bg-indigo-50 text-indigo-700">
                        案件：{item.cases.title}
                      </span>
                    ) : (
                      <span className="info-tag bg-gray-100 text-gray-500">未關聯案件</span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                    {item.location && <span className="max-w-[180px] truncate">📍 {item.location}</span>}
                    {item.participants && <span className="max-w-[240px] truncate">👥 {item.participants}</span>}
                  </div>
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
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
      />
    </svg>
  );
}
