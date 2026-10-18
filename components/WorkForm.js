import { useRef, useState } from 'react';
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
