import { useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { createClient } from '@/lib/supabaseBrowser';
import { saveAttachments } from '@/lib/api';
import AttachmentEditor from '@/components/AttachmentEditor';
import { useUser } from '@/components/UserContext';
import {
  PROPERTY_CATEGORIES,
  PROPERTY_STATUS_OPTIONS,
  ACQUIRED_METHOD_OPTIONS,
} from '@/lib/constants';

const BUCKET = 'property-files';

/**
 * 財產新增／編輯表單
 * mode: 'new' | 'edit'
 * initial: 財產資料（含 attachments）— 編輯模式必填
 */
export default function PropertyForm({ mode = 'new', initial = {} }) {
  const router = useRouter();
  const { user } = useUser();

  const [form, setForm] = useState({
    name: initial.name || '',
    category: initial.category || '',
    quantity: initial.quantity != null ? String(initial.quantity) : '1',
    acquired_date: initial.acquired_date || '',
    acquired_method: initial.acquired_method || '',
    amount: initial.amount != null ? String(initial.amount) : '',
    location: initial.location || '',
    status: initial.status || 'in_use',
    notes: initial.notes || '',
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
    if (!form.name.trim()) {
      setError('請輸入財產名稱');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (!form.category) {
      setError('請選擇財產分類');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSaving(true);
    setError('');
    try {
      const supabase = createClient();
      const payload = {
        name: form.name.trim(),
        category: form.category,
        quantity: form.quantity ? Number(form.quantity) : 1,
        acquired_date: form.acquired_date || null,
        acquired_method: form.acquired_method || null,
        amount: form.amount === '' ? null : Number(form.amount),
        location: form.location.trim() || null,
        status: form.status,
        notes: form.notes.trim() || null,
      };

      let recordId = initial.id;
      if (mode === 'edit') {
        const { error: updateError } = await supabase
          .from('properties')
          .update(payload)
          .eq('id', recordId);
        if (updateError) throw new Error(updateError.message);
      } else {
        payload.created_by = user?.id || null;
        const { data, error: insertError } = await supabase
          .from('properties')
          .insert(payload)
          .select('id')
          .single();
        if (insertError) throw new Error(insertError.message);
        recordId = data.id;
      }

      await saveAttachments({
        relatedTable: 'properties',
        relatedId: recordId,
        bucket: BUCKET,
        state: attachmentsRef.current,
      });

      router.push(`/properties/${recordId}`);
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
            <label htmlFor="name" className="label">
              財產名稱 <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              type="text"
              className="input"
              placeholder="例如：堆高機、辦公桌"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
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
              {PROPERTY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="quantity" className="label">
              數量
            </label>
            <input
              id="quantity"
              type="number"
              min="1"
              step="1"
              className="input"
              value={form.quantity}
              onChange={(e) => set('quantity', e.target.value)}
              disabled={saving}
            />
          </div>
        </div>
      </section>

      {/* 取得資訊 */}
      <section className="card p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-800">取得資訊</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="acquired_date" className="label">
              取得日期
            </label>
            <input
              id="acquired_date"
              type="date"
              className="input"
              value={form.acquired_date}
              onChange={(e) => set('acquired_date', e.target.value)}
              disabled={saving}
            />
          </div>

          <div>
            <label htmlFor="acquired_method" className="label">
              取得方式
            </label>
            <select
              id="acquired_method"
              className="input"
              value={form.acquired_method}
              onChange={(e) => set('acquired_method', e.target.value)}
              disabled={saving}
            >
              <option value="">請選擇</option>
              {ACQUIRED_METHOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="amount" className="label">
              金額（NT$）
            </label>
            <input
              id="amount"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              className="input"
              placeholder="選填"
              value={form.amount}
              onChange={(e) => set('amount', e.target.value)}
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
              {PROPERTY_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* 位置與備註 */}
      <section className="card p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-800">位置與備註</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="location" className="label">
              存放位置
            </label>
            <input
              id="location"
              type="text"
              className="input"
              placeholder="例如：里辦公室倉庫"
              value={form.location}
              onChange={(e) => set('location', e.target.value)}
              disabled={saving}
            />
          </div>

          <div>
            <label htmlFor="notes" className="label">
              備註
            </label>
            <textarea
              id="notes"
              rows={3}
              className="input resize-none"
              placeholder="其他補充說明"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              disabled={saving}
            />
          </div>
        </div>
      </section>

      {/* 照片附件 */}
      <section className="card p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-800">照片附件</h2>
        <AttachmentEditor
          initialAttachments={initial.attachments || []}
          bucket={BUCKET}
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
          onClick={() => router.push(initial.id ? `/properties/${initial.id}` : '/properties')}
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
