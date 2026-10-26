import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { useUser } from '@/components/UserContext';
import { createClient } from '@/lib/supabaseBrowser';
import { WORK_CATEGORIES, WORK_STATUS_OPTIONS, PAGE_SIZE } from '@/lib/constants';
import { formatDate, formatCurrency, calcWorkDays } from '@/lib/format';
import { escapeSearchKeyword } from '@/lib/api';
import { exportWorksExcel, exportWorksPdf } from '@/lib/exportWorks';
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

  // 匯出狀態
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exporting, setExporting] = useState('');
  const [exportNotice, setExportNotice] = useState('');

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

  // 點擊其他區域時收起匯出選單
  useEffect(() => {
    if (!exportMenuOpen) return;
    function close() {
      setExportMenuOpen(false);
    }
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [exportMenuOpen]);

  // 通知訊息自動消失
  useEffect(() => {
    if (!exportNotice) return;
    const timer = setTimeout(() => setExportNotice(''), 3500);
    return () => clearTimeout(timer);
  }, [exportNotice]);

  async function handleExport(kind) {
    setExportMenuOpen(false);
    setExporting(kind);
    setExportNotice('');
    try {
      if (kind === 'excel') {
        await exportWorksExcel(filters, filters.q);
      } else {
        await exportWorksPdf(filters, filters.q);
      }
    } catch (err) {
      setExportNotice(err.message || '匯出失敗，請稍後再試');
    } finally {
      setExporting('');
    }
  }

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

        <div className="mt-3 flex items-center justify-between">
          {hasActiveFilter ? (
            <button
              type="button"
              onClick={() => setFilters(initialFilters)}
              className="text-xs font-medium text-accent-600 hover:text-accent-700"
            >
              清除篩選條件
            </button>
          ) : (
            <span />
          )}

          {/* 匯出 */}
          <div className="relative">
            {exporting ? (
              <span className="flex items-center gap-2 rounded-xl bg-gray-100 px-4 py-2 text-xs font-medium text-gray-500">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                匯出中…
              </span>
            ) : (
              <>
                <button
                  type="button"
                  className="flex min-h-[36px] items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-gray-600 ring-1 ring-gray-200 transition-colors hover:bg-gray-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExportMenuOpen((v) => !v);
                  }}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                    />
                  </svg>
                  匯出
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {exportMenuOpen && (
                  <div className="absolute right-0 z-20 mt-1.5 w-36 overflow-hidden rounded-xl bg-white py-1 shadow-lg ring-1 ring-gray-100">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-medium text-gray-700 hover:bg-gray-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExport('excel');
                      }}
                    >
                      <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6M9 4v-2a1 1 0 011-1h4a1 1 0 011 1v2h4a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1h5z" />
                      </svg>
                      匯出 Excel
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-medium text-gray-700 hover:bg-gray-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExport('pdf');
                      }}
                    >
                      <svg className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5A3.375 3.375 0 0010.125 2.25H9M12 12v9m0-9l-3.75 3.75M12 12l3.75 3.75M9 4.5v-2A.75.75 0 019.75 2h4.5a.75.75 0 01.75.75v2" />
                      </svg>
                      匯出 PDF
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
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
            <Link key={item.id} href={`/works/${item.id}`} className="card card-bar card-bar-purple block p-4 transition-shadow hover:shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-[15px] font-bold text-gray-800">{item.title}</h2>
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
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span
                      className={`info-tag ${
                        item.status === 'in_progress' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {item.status === 'in_progress' ? '已進行' : '共進行'} {calcWorkDays(item.start_date, item.end_date)} 天
                    </span>
                    {progressCounts[item.id] > 0 && (
                      <span className="info-tag bg-gray-100 text-gray-600">進度 {progressCounts[item.id]} 筆</span>
                    )}
                    {(paidByWork[item.id] > 0 || item.total_amount != null) && (
                      <span className="info-tag bg-emerald-50 text-emerald-700">
                        已支出 {formatCurrency(paidByWork[item.id] || 0)}
                        {item.total_amount != null &&
                          `／未支出 ${formatCurrency(Number(item.total_amount) - (paidByWork[item.id] || 0))}`}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {item.total_amount != null && (
                    <span className="text-base font-bold text-accent-600">{formatCurrency(item.total_amount)}</span>
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

      {/* 匯出結果通知 */}
      {exportNotice && (
        <div className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-xl bg-gray-800 px-4 py-2.5 text-sm text-white shadow-lg md:bottom-6">
          {exportNotice}
        </div>
      )}
    </Layout>
  );
}
