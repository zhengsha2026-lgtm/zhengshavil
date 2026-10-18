import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { useUser } from '@/components/UserContext';
import { createClient } from '@/lib/supabaseBrowser';
import { PROPERTY_CATEGORIES, PROPERTY_STATUS_OPTIONS, PAGE_SIZE } from '@/lib/constants';
import { formatDate, formatCurrency } from '@/lib/format';
import { escapeSearchKeyword } from '@/lib/api';
import StatusBadge, { CategoryBadge } from '@/components/StatusBadge';
import Pagination from '@/components/Pagination';
import { LoadingPage, EmptyState } from '@/components/Feedback';

const initialFilters = { category: '', status: '', dateFrom: '', dateTo: '', q: '' };

export default function PropertiesPage() {
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
      let query = supabase.from('properties').select('*', { count: 'exact' });

      if (filters.category) query = query.eq('category', filters.category);
      if (filters.status) query = query.eq('status', filters.status);
      if (filters.dateFrom) query = query.gte('acquired_date', filters.dateFrom);
      if (filters.dateTo) query = query.lte('acquired_date', filters.dateTo);
      const kw = escapeSearchKeyword(debouncedQ);
      if (kw) {
        query = query.or(`name.ilike.%${kw}%,location.ilike.%${kw}%,notes.ilike.%${kw}%`);
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
  }, [filters.category, filters.status, filters.dateFrom, filters.dateTo, debouncedQ, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 切換篩選條件時回到第一頁
  useEffect(() => {
    setPage(1);
  }, [filters.category, filters.status, filters.dateFrom, filters.dateTo, debouncedQ]);

  const hasActiveFilter =
    filters.category || filters.status || filters.dateFrom || filters.dateTo || filters.q;

  return (
    <Layout title="財產紀錄">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-800">財產紀錄</h1>
          <p className="mt-0.5 text-xs text-gray-400">里內財產清冊，透明可查</p>
        </div>
        {isAdmin && (
          <Link href="/properties/new" className="btn-primary !px-3.5 !py-2 text-sm sm:!px-4">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            新增財產
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
            placeholder="搜尋名稱、位置或備註"
            value={filters.q}
            onChange={(e) => set('q', e.target.value)}
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <select
            className="input"
            value={filters.category}
            onChange={(e) => set('category', e.target.value)}
            aria-label="分類"
          >
            <option value="">全部分類</option>
            {PROPERTY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            className="input"
            value={filters.status}
            onChange={(e) => set('status', e.target.value)}
            aria-label="狀態"
          >
            <option value="">全部狀態</option>
            {PROPERTY_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <input
            type="date"
            className="input"
            value={filters.dateFrom}
            onChange={(e) => set('dateFrom', e.target.value)}
            aria-label="取得日期起"
          />
          <input
            type="date"
            className="input"
            value={filters.dateTo}
            onChange={(e) => set('dateTo', e.target.value)}
            aria-label="取得日期迄"
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
        <LoadingPage text="載入財產資料…" />
      ) : error ? (
        <div className="card px-4 py-10 text-center text-sm text-red-600">{error}</div>
      ) : data.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="📦"
            title={hasActiveFilter ? '沒有符合篩選條件的財產' : '尚無財產紀錄'}
            description={hasActiveFilter ? '請調整篩選條件後再試' : '管理員可以從右上角新增第一筆財產'}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((item) => (
            <Link key={item.id} href={`/properties/${item.id}`} className="card card-bar card-bar-blue block p-4 transition-shadow hover:shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-[15px] font-bold text-gray-800">{item.name}</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <CategoryBadge>{item.category}</CategoryBadge>
                    <StatusBadge type="property" value={item.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span>數量 {item.quantity ?? 1}</span>
                    {item.location && <span className="max-w-[180px] truncate">📍 {item.location}</span>}
                    {item.acquired_date && <span>{formatDate(item.acquired_date)}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {item.amount != null && (
                    <span className="text-base font-bold text-blue-600">{formatCurrency(item.amount)}</span>
                  )}
                  <svg className="h-4 w-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
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
