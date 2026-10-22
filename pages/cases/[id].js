import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { useUser } from '@/components/UserContext';
import { createClient } from '@/lib/supabaseBrowser';
import { deleteRecordWithAttachments } from '@/lib/api';
import { formatDate } from '@/lib/format';
import ConfirmDialog from '@/components/ConfirmDialog';
import { LoadingPage, ErrorState } from '@/components/Feedback';

export default function CaseDetailPage() {
  const router = useRouter();
  const { isAdmin, loading: userLoading } = useUser();
  const [record, setRecord] = useState(null);
  const [work, setWork] = useState(null);
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const load = useCallback(async () => {
    const id = router.query.id;
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { data, error: fetchError } = await supabase.from('cases').select('*').eq('id', id).maybeSingle();
      if (fetchError) throw fetchError;
      if (!data) {
        setError('找不到此案件');
        setLoading(false);
        return;
      }
      setRecord(data);

      const [workRes, inspRes] = await Promise.all([
        data.work_id
          ? supabase.from('works').select('id, title, status').eq('id', data.work_id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from('inspections')
          .select('id, title, inspection_date, stage, location')
          .eq('case_id', id)
          .order('inspection_date', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false }),
      ]);
      if (workRes.error) throw workRes.error;
      if (inspRes.error) throw inspRes.error;
      setWork(workRes.data || null);
      setInspections(inspRes.data || []);
      setLoading(false);
    } catch (err) {
      setError(err.message || '載入失敗');
      setLoading(false);
    }
  }, [router.query.id]);

  useEffect(() => {
    if (!router.isReady) return;
    load();
  }, [router.isReady, load]);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError('');
    try {
      // 先逐一刪除案件下的會勘（含照片與 Storage 檔案）
      await Promise.all(
        inspections.map((i) => deleteRecordWithAttachments('inspections', 'inspection-files', i.id))
      );
      // 再刪除案件本身（剩餘會勘由 on delete cascade 處理）
      const supabase = createClient();
      const { error: deleteError2 } = await supabase.from('cases').delete().eq('id', record.id);
      if (deleteError2) throw new Error(deleteError2.message);
      router.push('/cases');
    } catch (err) {
      setDeleteError(err.message || '刪除失敗，請稍後再試');
      setDeleting(false);
    }
  }

  return (
    <Layout title={record ? record.title : '案件詳情'}>
      <div className="mb-4 flex items-center gap-2">
        <Link
          href="/cases"
          className="flex items-center gap-1 text-sm font-medium text-gray-500 transition-colors hover:text-accent-600"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          案件紀錄
        </Link>
      </div>

      {loading || userLoading ? (
        <LoadingPage text="載入案件資料…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => router.reload()} />
      ) : record ? (
        <div className="space-y-4">
          {/* 案件資訊卡 */}
          <div className="card card-bar card-bar-indigo p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-gray-800">{record.title}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span
                    className={`info-tag ${
                      record.status === 'in_progress'
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {record.status === 'in_progress' ? '進行中' : '已結案'}
                  </span>
                  <span className="info-tag bg-teal-50 text-teal-700">會勘 {inspections.length} 次</span>
                  {record.location && (
                    <span className="info-tag bg-gray-100 text-gray-600">📍 {record.location}</span>
                  )}
                </div>
              </div>
              {isAdmin && (
                <div className="flex gap-2">
                  <Link href={`/cases/${record.id}/edit`} className="btn-secondary !px-3.5 !py-2 text-sm">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"
                      />
                    </svg>
                    編輯
                  </Link>
                  <button
                    type="button"
                    className="btn-danger !px-3.5 !py-2 text-sm"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                      />
                    </svg>
                    刪除
                  </button>
                </div>
              )}
            </div>

            {record.description && (
              <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3">
                <p className="text-xs text-gray-400">案件說明</p>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-gray-700">
                  {record.description}
                </p>
              </div>
            )}
          </div>

          {/* 關聯工作 */}
          {work ? (
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-semibold text-gray-800">關聯工作</h2>
              <Link
                href={`/works/${work.id}`}
                className="card card-bar card-bar-purple flex items-center justify-between gap-3 p-4 transition-shadow hover:shadow-soft"
              >
                <div className="min-w-0">
                  <h3 className="truncate text-[15px] font-bold text-gray-800">{work.title}</h3>
                  <p className="mt-1 text-xs text-gray-400">點擊查看工作詳情與進度</p>
                </div>
                <svg className="h-4 w-4 shrink-0 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          ) : null}

          {/* 會勘紀錄 */}
          <div className="card p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-gray-800">會勘紀錄（{inspections.length} 筆）</h2>
              {isAdmin && (
                <Link
                  href={`/inspections/new?case_id=${record.id}`}
                  className="btn-primary !px-3.5 !py-2 text-sm"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  新增會勘
                </Link>
              )}

            </div>

            {inspections.length === 0 ? (
              <p className="py-6 text-center text-xs text-gray-400">
                此案件尚無會勘紀錄
                {isAdmin ? '，可點擊「新增會勘」記錄現場勘查' : ''}
              </p>
            ) : (
              <div className="space-y-2.5">
                {inspections.map((insp) => (
                  <Link
                    key={insp.id}
                    href={`/inspections/${insp.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-4 py-3 transition-colors hover:border-teal-200 hover:bg-teal-50/40"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-semibold text-gray-800">{insp.title}</p>
                        {insp.stage && (
                          <span className="info-tag bg-teal-50 text-teal-700">{insp.stage}</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-400">
                        {formatDate(insp.inspection_date)}
                        {insp.location ? ` · ${insp.location}` : ''}
                      </p>
                    </div>
                    <svg className="h-4 w-4 shrink-0 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* 刪除確認 */}
      <ConfirmDialog
        open={confirmDelete}
        title="刪除案件"
        message={`確定要刪除「${record?.title}」嗎？\n案件下的 ${inspections.length} 筆會勘與所有照片都會一併刪除，且無法復原。`}
        confirmText="確認刪除"
        danger
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => {
          if (!deleting) {
            setConfirmDelete(false);
            setDeleteError('');
          }
        }}
      />
      {deleteError && (
        <div className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-xl bg-red-600 px-4 py-2.5 text-sm text-white shadow-lg md:bottom-6">
          {deleteError}
        </div>
      )}
    </Layout>
  );
}
