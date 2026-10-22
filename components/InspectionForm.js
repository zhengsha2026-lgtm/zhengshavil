import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { createClient } from '@/lib/supabaseBrowser';
import { saveAttachments } from '@/lib/api';
import AttachmentEditor from '@/components/AttachmentEditor';
import { useUser } from '@/components/UserContext';
import { todayStr } from '@/lib/format';

const BUCKET = 'inspection-files';
const STAGE_OPTIONS = ['初勘', '複勘', '完工會勘'];

/**
 * 會勘紀錄新增／編輯表單
 * mode: 'new' | 'edit'
 * initial: 會勘資料（含 attachments）— 編輯模式必填
 * defaultCaseId: 預設所屬案件（從案件詳情頁進入時自動帶入，鎖定不可改）
 * quickWorkId: 快速建立新案件時自動關聯的工作（從工作詳情頁進入時帶入）
 * allowCaseChange: 是否顯示案件選擇／快速建立（從案件列表頁進入時為 true）
 */
export default function InspectionForm({
  mode = 'new',
  initial = {},
  defaultCaseId = null,
  quickWorkId = null,
  allowCaseChange = false,
}) {
  const router = useRouter();
  const { user } = useUser();
  const isEdit = mode === 'edit';

  const [form, setForm] = useState({
    title: initial.title || '',
    inspection_date: initial.inspection_date || todayStr(),
    location: initial.location || '',
    participants: initial.participants || '',
    description: initial.description || '',
    conclusion: initial.conclusion || '',
    notes: initial.notes || '',
    stage: initial.stage || '',
  });
  const [cases, setCases] = useState([]); // 可選擇的既有案件
  const [lockedCase, setLockedCase] = useState(null); // 鎖定的案件（從案件詳情頁帶入時）
  const [caseMode, setCaseMode] = useState('existing'); // existing | new
  const [caseId, setCaseId] = useState(initial.case_id || defaultCaseId || '');
  const [newCaseTitle, setNewCaseTitle] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const attachmentsRef = useRef({
    existing: initial.attachments || [],
    pending: [],
  });

  // 載入案件資料：
  // - allowCaseChange 時載入可選擇的案件清單（最近 100 筆）
  // - 鎖定案件時（defaultCaseId）載入該案件名稱顯示為唯讀
  useEffect(() => {
    async function loadCases() {
      try {
        const supabase = createClient();
        if (allowCaseChange) {
          const { data, error: casesError } = await supabase
            .from('cases')
            .select('id, title, status')
            .order('created_at', { ascending: false })
            .limit(100);
          if (casesError) throw casesError;
          setCases(data || []);
        } else if (defaultCaseId) {
          const { data, error: caseError } = await supabase
            .from('cases')
            .select('id, title')
            .eq('id', defaultCaseId)
            .maybeSingle();
          if (caseError) throw caseError;
          setLockedCase(data || null);
        }
      } catch (err) {
        console.error('載入案件資料失敗：', err);
      }
    }
    loadCases();
  }, [allowCaseChange, defaultCaseId]);

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
    if (allowCaseChange && caseMode === 'new' && !newCaseTitle.trim()) {
      setError('請輸入新案件名稱，或改為選擇既有案件');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (!allowCaseChange && !caseId) {
      setError('缺少所屬案件，請從案件頁重新進入');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (caseMode === 'existing' && !caseId) {
      setError('請選擇所屬案件，或切換為快速建立新案件');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSaving(true);
    setError('');
    try {
      const supabase = createClient();

      // 1. 決定所屬案件（必要時快速建立新案件，不跳頁）
      let finalCaseId = caseId;
      if (allowCaseChange && caseMode === 'new') {
        const casePayload = {
          title: newCaseTitle.trim(),
          work_id: quickWorkId || null,
        };
        casePayload.created_by = user?.id || null;
        const { data: caseData, error: caseError } = await supabase
          .from('cases')
          .insert(casePayload)
          .select('id')
          .single();
        if (caseError) throw new Error(`建立案件失敗：${caseError.message}`);
        finalCaseId = caseData.id;
      }

      // 2. 儲存會勘
      const payload = {
        case_id: finalCaseId,
        title: form.title.trim(),
        inspection_date: form.inspection_date,
        location: form.location.trim() || null,
        participants: form.participants.trim() || null,
        description: form.description.trim() || null,
        conclusion: form.conclusion.trim() || null,
        notes: form.notes.trim() || null,
        stage: form.stage.trim() || null,
      };

      let recordId = initial.id;
      if (isEdit) {
        const { error: updateError } = await supabase.from('inspections').update(payload).eq('id', recordId);
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

      // 3. 照片附件
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

      {/* 所屬案件 */}
      <section className="card p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-800">
          所屬案件 <span className="text-red-500">*</span>
        </h2>

        {allowCaseChange ? (
          <>
            <div className="mb-3 flex gap-2">
              <button
                type="button"
                onClick={() => setCaseMode('existing')}
                disabled={saving}
                className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                  caseMode === 'existing'
                    ? 'bg-accent-600 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                選擇既有案件
              </button>
              <button
                type="button"
                onClick={() => setCaseMode('new')}
                disabled={saving}
                className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                  caseMode === 'new'
                    ? 'bg-accent-600 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                快速建立新案件
              </button>
            </div>

            {caseMode === 'existing' ? (
              <div>
                <select
                  className="input"
                  value={caseId}
                  onChange={(e) => setCaseId(e.target.value)}
                  disabled={saving}
                  aria-label="所屬案件"
                >
                  <option value="">請選擇案件</option>
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                      {c.status === 'completed' ? '（已結案）' : ''}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-gray-400">列表顯示最近 100 筆案件</p>
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  className="input"
                  placeholder="新案件名稱，例如：中山路巷口路面損壞案"
                  value={newCaseTitle}
                  onChange={(e) => setNewCaseTitle(e.target.value)}
                  disabled={saving}
                />
                <p className="mt-1.5 text-xs text-gray-400">
                  儲存時自動建立案件，無需另外操作{quickWorkId ? '，並自動關聯此工作' : ''}
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center gap-3 rounded-xl bg-indigo-50/60 px-4 py-3">
            <svg className="h-5 w-5 shrink-0 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-gray-800">{lockedCase?.title || '載入中…'}</p>
              <p className="text-xs text-gray-400">此會勘將記錄在上述案件下</p>
            </div>
          </div>
        )}
      </section>

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
            <label htmlFor="stage" className="label">
              會勘階段
            </label>
            <input
              id="stage"
              type="text"
              className="input"
              list="stage-options"
              placeholder="初勘、複勘、完工會勘或自由輸入"
              value={form.stage}
              onChange={(e) => set('stage', e.target.value)}
              disabled={saving}
            />
            <datalist id="stage-options">
              {STAGE_OPTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          <div className="sm:col-span-2">
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
