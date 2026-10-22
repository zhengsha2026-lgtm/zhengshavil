import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { createClient } from '@/lib/supabaseBrowser';
import { useUser } from '@/components/UserContext';

/**
 * 案件新增／編輯表單
 * mode: 'new' | 'edit'
 * initial: 案件資料（編輯模式必填）
 * defaultWorkId: 預設關聯的工作（從工作詳情頁進入時自動帶入）
 */
export default function CaseForm({ mode = 'new', initial = {}, defaultWorkId = null }) {
  const router = useRouter();
  const { user } = useUser();

  const [form, setForm] = useState({
    title: initial.title || '',
    description: initial.description || '',
    location: initial.location || '',
    status: initial.status || 'in_progress',
    work_id: initial.work_id || defaultWorkId || '',
  });
  const [works, setWorks] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // 載入可關聯的工作清單（最近 100 筆）
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
      setError('請輸入案件名稱');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSaving(true);
    setError('');
    try {
      const supabase = createClient();
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        location: form.location.trim() || null,
        status: form.status,
        work_id: form.work_id || null,
      };

      let recordId = initial.id;
      if (mode === 'edit') {
        const { error: updateError } = await supabase.from('cases').update(payload).eq('id', recordId);
        if (updateError) throw new Error(updateError.message);
      } else {
        payload.created_by = user?.id || null;
        const { data, error: insertError } = await supabase
          .from('cases')
          .insert(payload)
          .select('id')
          .single();
        if (insertError) throw new Error(insertError.message);
        recordId = data.id;
      }

      router.push(`/cases/${recordId}`);
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
            <label htmlFor="case_title" className="label">
              案件名稱 <span className="text-red-500">*</span>
            </label>
            <input
              id="case_title"
              type="text"
              className="input"
              placeholder="例如：中山路巷口路面損壞案"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              disabled={saving}
              required
            />
          </div>

          <div>
            <label htmlFor="case_location" className="label">
              地點
            </label>
            <input
              id="case_location"
              type="text"
              className="input"
              placeholder="例如：正砂里XX巷"
              value={form.location}
              onChange={(e) => set('location', e.target.value)}
              disabled={saving}
            />
          </div>

          <div>
            <label htmlFor="case_status" className="label">
              案件狀態
            </label>
            <select
              id="case_status"
              className="input"
              value={form.status}
              onChange={(e) => set('status', e.target.value)}
              disabled={saving}
            >
              <option value="in_progress">進行中</option>
              <option value="completed">已結案</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="case_description" className="label">
              案件說明
            </label>
            <textarea
              id="case_description"
              rows={4}
              className="input resize-none"
              placeholder="案件背景、處理目標等"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
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
          若案件源自某項工程／工作，可選擇關聯；工作詳情頁也會顯示此案件與其會勘
        </p>
      </section>

      {/* 動作按鈕 */}
      <div className="sticky bottom-20 z-10 flex gap-3 md:bottom-4">
        <button
          type="button"
          className="btn-secondary flex-1 shadow-soft md:flex-none md:px-8"
          onClick={() => router.push(initial.id ? `/cases/${initial.id}` : '/cases')}
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
