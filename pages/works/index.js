import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { useUser } from '@/components/UserContext';
import { createClient } from '@/lib/supabaseBrowser';
import { WORK_CATEGORIES, WORK_STATUS_OPTIONS, PAGE_SIZE } from '@/lib/constants';
import { formatDate, formatCurrency, calcWorkDays } from '@/lib/format';
import { escapeSearchKeyword } from '@/lib/api';
import StatusBadge, { CategoryBadge } from '@/components/StatusBadge';
import Pagination from '@/components/Pagination';
import { LoadingPage, EmptyState } from '@/components/Feedback';

const initialFilters = { category: '', status: '', dateFrom: '', dateTo: '', q: '' };

export default function WorksPage() {
  const { isAdmin } = useUser();
  const [filters, setFilters] = useState(initialFilters);
  const [debouncedQ, setDebouncedQ] = useState('');
  const [data, setData] = useState([]);
  const [progressCounts, setProgressCounts] = useState({});
  const [paidByWork, setPaidByWork] = useState({});
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
      let query = supabase.from('works').select('*', { count: 'exact' });

      if (filters.category) query = query.eq('category', filters.category);
      if (filters.status) query = query.eq('status', filters.status);
      if (filters.dateFrom) query = query.gte('start_date', filters.dateFrom);
      if (filters.dateTo) query = query.lte('start_date', filters.dateTo);
      const kw = escapeSearchKeyword(debouncedQ);
      if (kw) {
        query = query.or(`title.ilike.%${kw}%,location.ilike.%${kw}%,description.ilike.%${kw}%`);
      }

      query = query
        .order('start_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      const { data: rows, error: queryError, count } = await query;
      if (queryError) throw queryError;
      setData(rows || []);
      setTotal(count || 0);

      // 每筆工作的進度筆數與已支出（進度付款加總）
      if (rows && rows.length > 0) {
        const { data: progressRows, error: progressError } = await supabase
          .from('work_progress')
          .select('work_id, payment_amount')
          .in('work_id', rows.map((r) => r.id));
        if (progressError) throw progressError;
        const counts = {};
        const paid = {};
        (progressRows || []).forEach((p) => {
          counts[p.work_id] = (counts[p.work_id] || 0) + 1;
          paid[p.work_id] = (paid[p.work_id] || 0) + (Number(p.payment_amount) || 0);
        });
        setProgressCounts(counts);
        setPaidByWork(paid);
      } else {
        setProgressCounts({});
        setPaidByWork({});
      }
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
    <Layout title="工作紀錄">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-800">工作紀錄</h1>
          <p className="mt-0.5 text-xs text-gray-400">里內建設與工作成果，透明可查</p>
        </div>
        {isAdmin && (
          <Link href="/works/new" className="btn-primary !px-3.5 !py-2 text-sm sm:!px-4">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            新增工作
          </Link>
        )}
      </div>

      {/* 篩選器 */}
      <div className="card mb-4 p-4">
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
            placeholder="搜尋標題、地點或說明"
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
            {WORK_CATEGORIES.map((c) => (
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
            {WORK_STATUS_OPTIONS.map((o) => (
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
            aria-label="開始日期起"
          />
          <input
            type="date"
            className="input"
            value={filters.dateTo}
            onChange={(e) => set('dateTo', e.target.value)}
            aria-label="開始日期迄"
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
        <LoadingPage text="載入工作資料…" />
      ) : error ? (
        <div className="card px-4 py-10 text-center text-sm text-red-600">{error}</div>
      ) : data.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="🛠️"
            title={hasActiveFilter ? '沒有符合篩選條件的工作紀錄' : '尚無工作紀錄'}
            description={hasActiveFilter ? '請調整篩選條件後再試' : '管理員可以從右上角新增第一筆工作紀錄'}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((item) => (
            <Link key={item.id} href={`/works/${item.id}`} className="card block p-4 transition-shadow hover:shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-[15px] font-semibold text-gray-800">{item.title}</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <CategoryBadge>{item.category}</CategoryBadge>
                    <StatusBadge type="work" value={item.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                    {item.start_date && (
                      <span>
                        {formatDate(item.start_date)}
                        {item.end_date ? ` ~ ${formatDate(item.end_date)}` : ''}
                      </span>
                    )}
                    {item.location && <span className="max-w-[180px] truncate">📍 {item.location}</span>}
                    {item.executor && <span>👷 {item.executor}</span>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                    <span>
                      {item.status === 'in_progress' ? '⏳ 已進行' : '✅ 共進行'}{' '}
                      {calcWorkDays(item.start_date, item.end_date)} 天
                    </span>
                    {progressCounts[item.id] > 0 && <span>📝 進度 {progressCounts[item.id]} 筆</span>}
                  </div>
                  {(paidByWork[item.id] > 0 || item.total_amount != null) && (
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                      <span>💰 已支出 {formatCurrency(paidByWork[item.id] || 0)}</span>
                      {item.total_amount != null && (
                        <span>／未支出 {formatCurrency(Number(item.total_amount) - (paidByWork[item.id] || 0))}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {item.total_amount != null && (
                    <span className="text-sm font-semibold text-gray-700">{formatCurrency(item.total_amount)}</span>
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
