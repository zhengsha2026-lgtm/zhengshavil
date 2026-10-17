import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { useUser } from '@/components/UserContext';
import { createClient } from '@/lib/supabaseBrowser';
import { fetchAttachments, attachmentPublicUrl, deleteRecordWithAttachments } from '@/lib/api';
import { formatDate, formatCurrency } from '@/lib/format';
import StatusBadge, { CategoryBadge } from '@/components/StatusBadge';
import PhotoWall from '@/components/PhotoWall';
import ConfirmDialog from '@/components/ConfirmDialog';
import { LoadingPage, ErrorState } from '@/components/Feedback';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (!router.isReady) return;
    const id = router.query.id;
    if (!id) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const supabase = createClient();
        const { data, error: fetchError } = await supabase
          .from('works')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (cancelled) return;
        if (fetchError) throw fetchError;
        if (!data) {
          setError('找不到此工作紀錄');
          setLoading(false);
          return;
        }
        setRecord(data);
        const attachments = await fetchAttachments('works', id);
        if (cancelled) return;
        setPhotos(
          attachments.map((a) => ({
            id: a.id,
            url: attachmentPublicUrl(BUCKET, a.file_path),
            caption: a.caption,
          }))
        );
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || '載入失敗');
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [router.isReady, router.query.id]);

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
              <Field label="工作日期">{formatDate(record.work_date)}</Field>
              <Field label="執行者">{record.executor || '-'}</Field>
              <Field label="地點">{record.location || '-'}</Field>
              <Field label="費用">{formatCurrency(record.cost)}</Field>
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

          {/* 照片牆 */}
          <div className="card p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-800">施工照片</h2>
            <PhotoWall photos={photos} emptyText="尚無施工照片" />
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        title="刪除工作紀錄"
        message={`確定要刪除「${record?.title}」嗎？\n此操作會一併刪除所有施工照片，且無法復原。`}
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
