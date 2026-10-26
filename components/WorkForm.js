import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { createClient } from '@/lib/supabaseBrowser';
import { saveAttachments } from '@/lib/api';
import AttachmentEditor from '@/components/AttachmentEditor';
import { useUser } from '@/components/UserContext';
import { WORK_CATEGORIES, WORK_STATUS_OPTIONS, WORK_CAPTION_PRESETS } from '@/lib/constants';
import { todayStr } from '@/lib/format';

const BUCKET = 'work-files';

/**
 * 工作紀錄新增／編輯表單
 * mode: 'new' | 'edit'
 * initial: 工作資料（含 attachments）— 編輯模式必填
 */
export default function WorkForm({ mode = 'new', initial = {} }) {
  const router = useRouter();
  const { user } = useUser();

  const [form, setForm] = useState({
    title: initial.title || '',
    category: initial.category || '',
    start_date: initial.start_date || todayStr(),
    end_date: initial.end_date || '',
    status: initial.status || 'completed',
    executor: initial.executor || '',
    location: initial.location || '',
    total_amount: initial.total_amount != null ? String(initial.total_amount) : '',
    description: initial.description || '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const attachmentsRef = useRef({
    existing: initial.attachments || [],
    pending: [],
  });

  // 關聯案件：可選清單（未關聯其他工作的案件＋編輯時目前關聯者）
  const [availableCases, setAvailableCases] = useState([]);
  const [casesLoaded, setCasesLoaded] = useState(false);
  const [caseSearch, setCaseSearch] = useState('');
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const originalCaseIdRef = useRef(null);

  useEffect(() => {
    async function loadCases() {
      try {
        const supabase = createClient();
        // 只撈「尚未關聯工作」的案件；編輯模式另外包含目前關聯本工作的案件
        let filter = 'work_id.is.null';
        if (mode === 'edit' && initial.id) {
          filter += `,work_id.eq.${initial.id}`;
        }
        const { data, error: casesError } = await supabase
          .from('cases')
          .select('id, title, status, work_id, inspections(count)')
          .or(filter)
          .order('created_at', { ascending: false })
          .limit(500);
        if (casesError) throw casesError;
        const rows = data || [];
        setAvailableCases(rows);
        if (mode === 'edit') {
          const current = rows.find((c) => c.work_id === initial.id);
          originalCaseIdRef.current = current?.id || null;
          setSelectedCaseId(current?.id || '');
        }
      } catch (err) {
        console.error('載入案件清單失敗：', err);
      } finally {
        setCasesLoaded(true);
      }
    }
    loadCases();
  }, [mode, initial.id]);

  const filteredCases = caseSearch.trim()
    ? availableCases.filter((c) => c.title.toLowerCase().includes(caseSearch.trim().toLowerCase()))
    : availableCases;

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError('請輸入工作標題');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (!form.category) {
      setError('請選擇工作分類');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (!form.start_date) {
      setError('請選擇開始日期');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (form.end_date && form.end_date < form.start_date) {
      setError('結束日期不能早於開始日期');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSaving(true);
    setError('');
    try {
      const supabase = createClient();
      const payload = {
        title: form.title.trim(),
        category: form.category,
        start_date: form.start_date,
        end_date: form.end_date || null,
        status: form.status,
        executor: form.executor.trim() || null,
        location: form.location.trim() || null,
        total_amount: form.total_amount === '' ? null : Number(form.total_amount),
        description: form.description.trim() || null,
      };

      let recordId = initial.id;
      if (mode === 'edit') {
        const { error: updateError } = await supabase.from('works').update(payload).eq('id', recordId);
        if (updateError) throw new Error(updateError.message);
      } else {
        payload.created_by = user?.id || null;
        const { data, error: insertError } = await supabase
          .from('works')
          .insert(payload)
          .select('id')
          .single();
        if (insertError) throw new Error(insertError.message);
        recordId = data.id;
      }

      // 關聯案件同步（僅在選擇變更時處理，條件更新避免同時操作覆蓋）
      const originalCaseId = originalCaseIdRef.current;
      const caseChanged = mode === 'edit' ? originalCaseId !== selectedCaseId : !!selectedCaseId;

      if (caseChanged) {
        // 編輯模式：先解除原案件（僅當它仍指向本工作）
        if (mode === 'edit' && originalCaseId) {
          const { error: clearError } = await supabase
            .from('cases')
            .update({ work_id: null })
            .eq('id', originalCaseId)
            .eq('work_id', recordId);
          if (clearError) throw new Error(`解除原案件關聯失敗：${clearError.message}`);
        }

        // 設定新案件（條件：仍未關聯任何工作，搶到的才算數）
        if (selectedCaseId) {
          const { data: linkedRows, error: linkError } = await supabase
            .from('cases')
            .update({ work_id: recordId })
            .eq('id', selectedCaseId)
            .is('work_id', null)
            .select('id');
          if (linkError) throw new Error(`關聯案件失敗：${linkError.message}`);
          if (!linkedRows || linkedRows.length === 0) {
            throw new Error(
              mode === 'edit'
                ? '所選案件已關聯其他工作，工作資料已儲存但未變更關聯，請重新整理後再試'
                : '所選案件已關聯其他工作，工作已建立但未關聯案件，請重新整理後再試'
            );
          }
        }
      }

      await saveAttachments({
        relatedTable: 'works',
        relatedId: recordId,
        bucket: BUCKET,
        state: attachmentsRef.current,
      });

      router.push(`/works/${recordId}`);
    } catch (err) {
      setError(err.message || '儲存失敗，請稍後再試');
      setSaving(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {/* 基本資料 */}
      <section className="card p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-800">基本資料</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="title" className="label">
              工作標題 <span className="text-red-500">*</span>
            </label>
            <input
              id="title"
              type="text"
              className="input"
              placeholder="例如：中山路巷口道路鋪面修補"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              disabled={saving}
            />
          </div>

          <div>
            <label htmlFor="category" className="label">
              分類 <span className="text-red-500">*</span>
            </label>
            <select
              id="category"
              className="input"
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
              disabled={saving}
            >
              <option value="">請選擇分類</option>
              {WORK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="start_date" className="label">
              開始日期 <span className="text-red-500">*</span>
            </label>
            <input
              id="start_date"
              type="date"
              className="input"
              value={form.start_date}
              onChange={(e) => set('start_date', e.target.value)}
              disabled={saving}
              required
            />
          </div>

          <div>
            <label htmlFor="end_date" className="label">
              結束日期
            </label>
            <input
              id="end_date"
              type="date"
              className="input"
              value={form.end_date}
              min={form.start_date || undefined}
              onChange={(e) => set('end_date', e.target.value)}
              disabled={saving}
            />
          </div>

          <div>
            <label htmlFor="status" className="label">
              狀態
            </label>
            <select
              id="status"
              className="input"
              value={form.status}
              onChange={(e) => set('status', e.target.value)}
              disabled={saving}
            >
              {WORK_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="executor" className="label">
              執行者
            </label>
            <input
              id="executor"
              type="text"
              className="input"
              placeholder="例如：里長、清潔隊"
              value={form.executor}
              onChange={(e) => set('executor', e.target.value)}
              disabled={saving}
            />
          </div>
        </div>
      </section>

      {/* 相關案件 */}
      <section className="card p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-800">相關案件</h2>
        <div className="space-y-3">
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
              placeholder="搜尋案件名稱"
              value={caseSearch}
              onChange={(e) => setCaseSearch(e.target.value)}
              disabled={saving}
              aria-label="搜尋案件"
            />
          </div>

          <select
            className="input"
            value={selectedCaseId}
            onChange={(e) => setSelectedCaseId(e.target.value)}
            disabled={saving}
            aria-label="關聯案件"
          >
            <option value="">不關聯任何案件</option>
            {!casesLoaded && <option value="" disabled>案件載入中…</option>}
            {filteredCases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}（{c.status === 'in_progress' ? '進行中' : '已結案'}・會勘{' '}
                {c.inspections?.[0]?.count ?? 0} 次）
              </option>
            ))}
          </select>

          <p className="text-xs text-gray-400">
            僅列出尚未關聯其他工作的案件；關聯後，案件與工作詳情頁會互相顯示
          </p>
        </div>
      </section>

      {/* 地點與費用 */}
      <section className="card p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-800">地點與費用</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="location" className="label">
              地點
            </label>
            <input
              id="location"
              type="text"
              className="input"
              placeholder="例如：正砂里XX巷"
              value={form.location}
              onChange={(e) => set('location', e.target.value)}
              disabled={saving}
            />
          </div>

          <div>
            <label htmlFor="total_amount" className="label">
              合約／預計總金額（NT$）
            </label>
            <input
              id="total_amount"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              className="input"
              placeholder="選填"
              value={form.total_amount}
              onChange={(e) => set('total_amount', e.target.value)}
              disabled={saving}
            />
            <p className="mt-1.5 text-xs text-gray-400">實際支出由各進度的付款自動加總</p>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="description" className="label">
              工作內容說明
            </label>
            <textarea
              id="description"
              rows={4}
              className="input resize-none"
              placeholder="說明工作內容、範圍、成果等"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              disabled={saving}
            />
          </div>
        </div>
      </section>

      {/* 照片附件 */}
      <section className="card p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-800">施工照片</h2>
        <AttachmentEditor
          initialAttachments={initial.attachments || []}
          bucket={BUCKET}
          captionPresets={WORK_CAPTION_PRESETS}
          onChange={(state) => {
            attachmentsRef.current = state;
          }}
        />
      </section>

      {/* 動作按鈕 */}
      <div className="sticky bottom-20 z-10 flex gap-3 md:bottom-4">
        <button
          type="button"
          className="btn-secondary flex-1 shadow-soft md:flex-none md:px-8"
          onClick={() => router.push(initial.id ? `/works/${initial.id}` : '/works')}
          disabled={saving}
        >
          取消
        </button>
        <button type="submit" className="btn-primary flex-1 shadow-soft md:flex-none md:px-10" disabled={saving}>
          {saving ? '儲存中…' : '儲存'}
        </button>
      </div>
    </form>
  );
}
