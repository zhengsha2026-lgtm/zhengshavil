import { useRef, useState, useEffect } from 'react';
import { createClient } from '@/lib/supabaseBrowser';
import { saveAttachments, syncWorkCost } from '@/lib/api';
import AttachmentEditor from '@/components/AttachmentEditor';
import { useUser } from '@/components/UserContext';
import { todayStr } from '@/lib/format';

const BUCKET = 'work-files';

/**
 * 進度紀錄新增／編輯 modal
 * - progress: null 表示新增；傳入進度物件表示編輯
 * - attachments: 編輯時該進度的既有附件
 * - onSaved: 儲存成功後回呼（父層重新載入資料）
 * 建議由父層條件式渲染，確保每次開啟都是全新狀態
 */
export default function ProgressFormModal({ workId, progress = null, attachments = [], onClose, onSaved }) {
  const { user } = useUser();
  const isEdit = !!progress;

  const [form, setForm] = useState({
    progress_date: progress?.progress_date || todayStr(),
    description: progress?.description || '',
    payment_amount:
      progress?.payment_amount != null && Number(progress.payment_amount) !== 0
        ? String(progress.payment_amount)
        : '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const attachmentsRef = useRef({ existing: attachments, pending: [] });

  // 開啟 modal 時鎖定背景捲動
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.progress_date) {
      setError('請選擇進度日期');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const supabase = createClient();
      const payload = {
        work_id: workId,
        progress_date: form.progress_date,
        description: form.description.trim() || null,
        payment_amount: form.payment_amount === '' ? 0 : Number(form.payment_amount),
      };

      let progressId = progress?.id;
      if (isEdit) {
        const { error: updateError } = await supabase
          .from('work_progress')
          .update(payload)
          .eq('id', progressId);
        if (updateError) throw new Error(updateError.message);
      } else {
        payload.created_by = user?.id || null;
        const { data, error: insertError } = await supabase
          .from('work_progress')
          .insert(payload)
          .select('id')
          .single();
        if (insertError) throw new Error(insertError.message);
        progressId = data.id;
      }

      await saveAttachments({
        relatedTable: 'works',
        relatedId: workId,
        bucket: BUCKET,
        state: attachmentsRef.current,
        progressId,
      });

      // 同步主工作已支出（cost = 進度付款加總）
      await syncWorkCost(workId);

      onSaved?.();
    } catch (err) {
      setError(err.message || '儲存失敗，請稍後再試');
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-800">{isEdit ? '編輯進度' : '新增進度'}</h2>
          <button
            type="button"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            onClick={() => !saving && onClose()}
            aria-label="關閉"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}

          <div>
            <label htmlFor="progress_date" className="label">
              進度日期 <span className="text-red-500">*</span>
            </label>
            <input
              id="progress_date"
              type="date"
              className="input"
              value={form.progress_date}
              onChange={(e) => setForm((f) => ({ ...f, progress_date: e.target.value }))}
              disabled={saving}
              required
            />
          </div>

          <div>
            <label htmlFor="progress_description" className="label">
              進度說明
            </label>
            <textarea
              id="progress_description"
              rows={4}
              className="input resize-none"
              placeholder="說明本次進度內容，例如：完成AC鋪設、施作位置等"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              disabled={saving}
            />
          </div>

          <div>
            <label htmlFor="payment_amount" className="label">
              本次付款金額（NT$）
            </label>
            <input
              id="payment_amount"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              className="input"
              placeholder="選填"
              value={form.payment_amount}
              onChange={(e) => setForm((f) => ({ ...f, payment_amount: e.target.value }))}
              disabled={saving}
            />
            <p className="mt-1.5 text-xs text-gray-400">系統會自動加總各進度付款為已支出</p>
          </div>

          <div>
            <p className="label">現場照片</p>
            <AttachmentEditor
              initialAttachments={attachments}
              bucket={BUCKET}
              onChange={(state) => {
                attachmentsRef.current = state;
              }}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              className="btn-secondary flex-1"
              onClick={() => !saving && onClose()}
              disabled={saving}
            >
              取消
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={saving}>
              {saving ? '儲存中…' : '儲存'}
            </button>
          </div>
        </form>
      </div>
      {saving && (
        <div className="fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-gray-800 px-4 py-2.5 text-sm text-white shadow-lg md:bottom-6">
          照片上傳中，請稍候…
        </div>
      )}
    </div>
  );
}
