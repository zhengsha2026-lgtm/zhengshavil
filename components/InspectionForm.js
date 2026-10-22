import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { createClient } from '@/lib/supabaseBrowser';
import { saveAttachments } from '@/lib/api';
import AttachmentEditor from '@/components/AttachmentEditor';
import { useUser } from '@/components/UserContext';
import { todayStr } from '@/lib/format';

const BUCKET = 'inspection-files';

/**
 * 會勘紀錄新增／編輯表單
 * mode: 'new' | 'edit'
 * initial: 會勘資料（含 attachments）— 編輯模式必填
 * defaultWorkId: 預設關聯的工作（從工作詳情頁進入時自動帶入）
 */
export default function InspectionForm({ mode = 'new', initial = {}, defaultWorkId = null }) {
  const router = useRouter();
  const { user } = useUser();

  const [form, setForm] = useState({
    title: initial.title || '',
    inspection_date: initial.inspection_date || todayStr(),
    location: initial.location || '',
    participants: initial.participants || '',
    description: initial.description || '',
    conclusion: initial.conclusion || '',
    notes: initial.notes || '',
    work_id: initial.work_id || defaultWorkId || '',
  });
  const [works, setWorks] = useState([]); // 可關聯的工作清單
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const attachmentsRef = useRef({
    existing: initial.attachments || [],
    pending: [],
  });

  // 載入可關聯的工作清單（最近 100 筆，依開始日期新到舊）
  useEffect(() => {
    async function loadWorks() {
      try {
        const supabase = createClient();
        const { data, error: worksError } = await supabase
          .from('works')
          .select('id, title, start_date')
          .order('start_date', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(100);
        if (worksError) throw worksError;
        setWorks(data || []);
      } catch (err) {
        // 關聯工作載入失敗不阻擋表單填寫
        console.error('載入工作清單失敗：', err);
      }
    }
    loadWorks();
  }, []);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError('請輸入會勘標題');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (!form.inspection_date) {
      setError('請選擇會勘日期');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSaving(true);
    setError('');
    try {
      const supabase = createClient();
      const payload = {
        title: form.title.trim(),
        inspection_date: form.inspection_date,
        location: form.location.trim() || null,
        participants: form.participants.trim() || null,
        description: form.description.trim() || null,
        conclusion: form.conclusion.trim() || null,
        notes: form.notes.trim() || null,
        work_id: form.work_id || null,
      };

      let recordId = initial.id;
      if (mode === 'edit') {
        const { error: updateError } = await supabase
          .from('inspections')
          .update(payload)
          .eq('id', recordId);
        if (updateError) throw new Error(updateError.message);
      } else {
        payload.created_by = user?.id || null;
        const { data, error: insertError } = await supabase
          .from('inspections')
          .insert(payload)
          .select('id')
          .single();
        if (insertError) throw new Error(insertError.message);
        recordId = data.id;
      }

      await saveAttachments({
        relatedTable: 'inspections',
        relatedId: recordId,
        bucket: BUCKET,
        state: attachmentsRef.current,
      });

      router.push(`/inspections/${recordId}`);
    } catch (err) {
      setError(err.message || '儲存失敗，請稍後再試');
      setSaving(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}

      {/* 基本資料 */}
      <section className="card p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-800">基本資料</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="title" className="label">
              會勘標題 <span className="text-red-500">*</span>
            </label>
            <input
              id="title"
              type="text"
              className="input"
              placeholder="例如：中山路巷口路面損壞會勘"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              disabled={saving}
            />
          </div>

          <div>
            <label htmlFor="inspection_date" className="label">
              會勘日期 <span className="text-red-500">*</span>
            </label>
            <input
              id="inspection_date"
              type="date"
              className="input"
              value={form.inspection_date}
              onChange={(e) => set('inspection_date', e.target.value)}
              disabled={saving}
              required
            />
          </div>

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

          <div className="sm:col-span-2">
            <label htmlFor="participants" className="label">
              參與人員
            </label>
            <input
              id="participants"
              type="text"
              className="input"
              placeholder="例如：里長、區公所承辦、里民（多位以頓號分隔）"
              value={form.participants}
              onChange={(e) => set('participants', e.target.value)}
              disabled={saving}
            />
          </div>
        </div>
      </section>

      {/* 會勘內容 */}
      <section className="card p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-800">會勘內容</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="description" className="label">
              現場狀況
            </label>
            <textarea
              id="description"
              rows={4}
              className="input resize-none"
              placeholder="描述現場勘查到的狀況、問題成因等"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              disabled={saving}
            />
          </div>

          <div>
            <label htmlFor="conclusion" className="label">
              結論／後續建議
            </label>
            <textarea
              id="conclusion"
              rows={3}
              className="input resize-none"
              placeholder="例如：建請區公所於兩週內派工修補"
              value={form.conclusion}
              onChange={(e) => set('conclusion', e.target.value)}
              disabled={saving}
            />
          </div>

          <div>
            <label htmlFor="notes" className="label">
              備註
            </label>
            <textarea
              id="notes"
              rows={2}
              className="input resize-none"
              placeholder="其他補充事項"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              disabled={saving}
            />
          </div>
        </div>
      </section>

      {/* 關聯工作 */}
      <section className="card p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-800">關聯工作（選填）</h2>
        <select
          className="input"
          value={form.work_id}
          onChange={(e) => set('work_id', e.target.value)}
          disabled={saving}
          aria-label="關聯工作"
        >
          <option value="">不關聯任何工作</option>
          {works.map((w) => (
            <option key={w.id} value={w.id}>
              {w.title}
              {w.start_date ? `（${w.start_date}）` : ''}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-gray-400">
          若會勘與某項工程／工作相關（如劃設標線、施工），可選擇關聯；工作詳情頁也會顯示此會勘
        </p>
      </section>

      {/* 照片附件 */}
      <section className="card p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-800">會勘照片</h2>
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
          onClick={() => router.push(initial.id ? `/inspections/${initial.id}` : '/inspections')}
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
