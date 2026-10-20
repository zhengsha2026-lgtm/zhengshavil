import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { useUser } from '@/components/UserContext';
import { createClient } from '@/lib/supabaseBrowser';
import {
  fetchAttachments,
  attachmentPublicUrl,
  deleteRecordWithAttachments,
  deleteProgressWithAttachments,
} from '@/lib/api';
import { formatDate, formatCurrency, calcWorkDays } from '@/lib/format';
import StatusBadge, { CategoryBadge } from '@/components/StatusBadge';
import PhotoWall from '@/components/PhotoWall';
import ConfirmDialog from '@/components/ConfirmDialog';
import ProgressFormModal from '@/components/ProgressFormModal';
import { LoadingPage, ErrorState, EmptyState } from '@/components/Feedback';

const BUCKET = 'work-files';

function Field({ label, children }) {
  return (
    <div>
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-gray-800">{children}</dd>
    </div>
  );
}

export default function WorkDetailPage() {
  const router = useRouter();
  const { isAdmin, loading: userLoading } = useUser();
  const [record, setRecord] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [progressList, setProgressList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // 進度 modal 狀態：null = 關閉；{ progress: null } = 新增；{ progress, attachments } = 編輯
  const [progressModal, setProgressModal] = useState(null);
  const [progressDeleting, setProgressDeleting] = useState(null); // 待刪除的進度物件
  const [progressDeletingBusy, setProgressDeletingBusy] = useState(false);
  const [progressDeleteError, setProgressDeleteError] = useState('');

  const load = useCallback(async () => {
    const id = router.query.id;
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from('works')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!data) {
        setError('找不到此工作紀錄');
        setLoading(false);
        return;
      }
      setRecord(data);

      // 主工作照片 + 進度紀錄（含各自的進度照片）一次讀取
      const [attachments, progressRes] = await Promise.all([
        fetchAttachments('works', id),
        supabase
          .from('work_progress')
          .select('*')
          .eq('work_id', id)
          .order('progress_date', { ascending: false })
          .order('created_at', { ascending: false }),
      ]);
      if (progressRes.error) throw progressRes.error;

      const toPhoto = (a) => ({
        id: a.id,
        url: attachmentPublicUrl(BUCKET, a.file_path),
        caption: a.caption,
      });

      // 主工作照片：未關聯進度的附件
      setPhotos(attachments.filter((a) => !a.progress_id).map(toPhoto));

      // 依 progress_id 分組照片
      const photosByProgress = {};
      attachments
        .filter((a) => a.progress_id)
        .forEach((a) => {
          (photosByProgress[a.progress_id] = photosByProgress[a.progress_id] || []).push(a);
        });

      setProgressList(
        (progressRes.data || []).map((p) => ({
          ...p,
          attachments: photosByProgress[p.id] || [],
          photos: (photosByProgress[p.id] || []).map(toPhoto),
        }))
      );
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
      await deleteRecordWithAttachments('works', BUCKET, record.id);
      router.push('/works');
    } catch (err) {
      setDeleteError(err.message || '刪除失敗，請稍後再試');
      setDeleting(false);
    }
  }

  async function handleDeleteProgress() {
    const target = progressDeleting;
    if (!target) return;
    setProgressDeletingBusy(true);
    setProgressDeleteError('');
    try {
      await deleteProgressWithAttachments(record.id, target.id, BUCKET);
      setProgressDeleting(null);
      await load();
    } catch (err) {
      setProgressDeleteError(err.message || '刪除失敗，請稍後再試');
    } finally {
      setProgressDeletingBusy(false);
    }
  }

  const days = record ? calcWorkDays(record.start_date, record.end_date) : 0;
  // 已支出 = 所有進度付款加總；未支出 = 總金額 − 已支出（有填總金額時才顯示）
  const paid = progressList.reduce((sum, p) => sum + (Number(p.payment_amount) || 0), 0);
  const totalAmount = record?.total_amount != null ? Number(record.total_amount) : null;

  return (
    <Layout title={record ? record.title : '工作詳情'}>
      <div className="mb-4 flex items-center gap-2">
        <Link
          href="/works"
          className="flex items-center gap-1 text-sm font-medium text-gray-500 transition-colors hover:text-accent-600"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          工作紀錄
        </Link>
      </div>

      {loading || userLoading ? (
        <LoadingPage text="載入工作資料…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => router.reload()} />
      ) : record ? (
        <div className="space-y-4">
          {/* 基本資訊卡 */}
          <div className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-gray-800">{record.title}</h1>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <CategoryBadge>{record.category}</CategoryBadge>
                  <StatusBadge type="work" value={record.status} />
                  <span className="inline-flex items-center rounded-lg bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    {record.status === 'in_progress' ? '已進行' : '共進行'} {days} 天
                  </span>
                </div>
              </div>
              {isAdmin && (
                <div className="flex gap-2">
                  <Link href={`/works/${record.id}/edit`} className="btn-secondary !px-3.5 !py-2 text-sm">
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

            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-gray-50 pt-5 sm:grid-cols-3">
              <Field label="開始日期">{formatDate(record.start_date)}</Field>
              <Field label="結束日期">{record.end_date ? formatDate(record.end_date) : '－'}</Field>
              <Field label="執行者">{record.executor || '-'}</Field>
              <Field label="地點">{record.location || '-'}</Field>
              <Field label="總金額">{formatCurrency(totalAmount)}</Field>
              <Field label="已支出">{formatCurrency(paid)}</Field>
              {totalAmount != null && (
                <Field label="未支出">{formatCurrency(totalAmount - paid)}</Field>
              )}
              <Field label="更新時間">{formatDate(record.updated_at?.slice(0, 10))}</Field>
            </dl>

            {record.description && (
              <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3">
                <p className="text-xs text-gray-400">工作內容說明</p>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-gray-700">
                  {record.description}
                </p>
              </div>
            )}
          </div>

          {/* 進度紀錄（時間軸） */}
          <div className="card p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-gray-800">進度紀錄（{progressList.length} 筆）</h2>
              {isAdmin && (
                <button type="button" className="btn-primary !px-3.5 !py-2 text-sm" onClick={() => setProgressModal({ progress: null })}>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  新增進度
                </button>
              )}
            </div>

            {progressList.length === 0 ? (
              <EmptyState
                icon="📋"
                title="尚無進度紀錄"
                description={isAdmin ? '點擊「新增進度」記錄工作進度與現場照片' : '此工作尚未新增進度紀錄'}
              />
            ) : (
              <ol>
                {progressList.map((p, idx) => (
                  <li key={p.id} className="relative pb-7 pl-9 last:pb-0">
                    {/* 時間軸連接線 */}
                    {idx < progressList.length - 1 && (
                      <span className="absolute bottom-0 left-[11px] top-7 w-px bg-gray-200" aria-hidden="true" />
                    )}
                    {/* 節點 */}
                    <span
                      className="absolute left-0 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent-100"
                      aria-hidden="true"
                    >
                      <span className="h-2 w-2 rounded-full bg-accent-500" />
                    </span>

                    <div className="flex items-start justify-between gap-2">
                      <span className="pt-0.5 text-sm font-semibold text-gray-800">
                        {formatDate(p.progress_date)}
                      </span>
                      {isAdmin && (
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-accent-600"
                            onClick={() =>
                              setProgressModal({ progress: p, attachments: p.attachments })
                            }
                            aria-label="編輯進度"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"
                              />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                            onClick={() => {
                              setProgressDeleteError('');
                              setProgressDeleting(p);
                            }}
                            aria-label="刪除進度"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                              />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>

                    {p.description && (
                      <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-gray-600">
                        {p.description}
                      </p>
                    )}

                    {Number(p.payment_amount) > 0 && (
                      <p className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-accent-50 px-2 py-1 text-xs font-medium text-accent-700">
                        💰 本次付款：{formatCurrency(p.payment_amount)}
                      </p>
                    )}

                    {p.photos.length > 0 && (
                      <div className="mt-3">
                        <PhotoWall photos={p.photos} />
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* 主工作照片牆 */}
          <div className="card p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-800">施工照片</h2>
            <PhotoWall photos={photos} emptyText="尚無施工照片" />
          </div>
        </div>
      ) : null}

      {/* 刪除主工作確認 */}
      <ConfirmDialog
        open={confirmDelete}
        title="刪除工作紀錄"
        message={`確定要刪除「${record?.title}」嗎？\n此操作會一併刪除所有進度紀錄與照片，且無法復原。`}
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

      {/* 刪除進度確認 */}
      <ConfirmDialog
        open={!!progressDeleting}
        title="刪除進度紀錄"
        message={`確定要刪除 ${progressDeleting ? formatDate(progressDeleting.progress_date) : ''} 的進度紀錄嗎？\n此操作會一併刪除該進度的照片，且無法復原。`}
        confirmText="確認刪除"
        danger
        busy={progressDeletingBusy}
        onConfirm={handleDeleteProgress}
        onCancel={() => {
          if (!progressDeletingBusy) {
            setProgressDeleting(null);
            setProgressDeleteError('');
          }
        }}
      />
      {progressDeleteError && (
        <div className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-xl bg-red-600 px-4 py-2.5 text-sm text-white shadow-lg md:bottom-6">
          {progressDeleteError}
        </div>
      )}

      {/* 新增／編輯進度 modal */}
      {progressModal && (
        <ProgressFormModal
          workId={record?.id}
          work={record}
          progress={progressModal.progress}
          attachments={progressModal.attachments || []}
          onClose={() => setProgressModal(null)}
          onSaved={() => {
            setProgressModal(null);
            load();
          }}
        />
      )}
    </Layout>
  );
}
