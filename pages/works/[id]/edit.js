import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import WorkForm from '@/components/WorkForm';
import { useUser } from '@/components/UserContext';
import { createClient } from '@/lib/supabaseBrowser';
import { fetchAttachments } from '@/lib/api';
import { LoadingPage, AccessDenied, ErrorState } from '@/components/Feedback';

export default function EditWorkPage() {
  const router = useRouter();
  const { isAdmin, loading: userLoading } = useUser();
  const [initial, setInitial] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!router.isReady) return;
    const id = router.query.id;
    if (!id) return;
    let cancelled = false;

    async function load() {
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
          return;
        }
        // 僅載入主工作照片（進度照片於詳情頁的進度紀錄管理）
        const attachments = await fetchAttachments('works', id, { mainOnly: true });
        if (cancelled) return;
        setInitial({ ...data, attachments });
      } catch (err) {
        if (!cancelled) setError(err.message || '載入失敗');
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [router.isReady, router.query.id]);

  return (
    <Layout title="編輯工作">
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

      {userLoading || (initial === null && !error) ? (
        <LoadingPage text="載入工作資料…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => router.reload()} />
      ) : !isAdmin ? (
        <AccessDenied />
      ) : (
        <>
          <div className="mb-4">
            <h1 className="text-lg font-bold text-gray-800">編輯工作</h1>
            <p className="mt-0.5 text-xs text-gray-400">{initial?.title}</p>
          </div>
          <WorkForm mode="edit" initial={initial} />
        </>
      )}
    </Layout>
  );
}
