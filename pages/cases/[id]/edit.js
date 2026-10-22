import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import CaseForm from '@/components/CaseForm';
import { useUser } from '@/components/UserContext';
import { createClient } from '@/lib/supabaseBrowser';
import { LoadingPage, AccessDenied, ErrorState } from '@/components/Feedback';

export default function EditCasePage() {
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
        const { data, error: fetchError } = await supabase.from('cases').select('*').eq('id', id).maybeSingle();
        if (cancelled) return;
        if (fetchError) throw fetchError;
        if (!data) {
          setError('找不到此案件');
          return;
        }
        setInitial(data);
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
    <Layout title="編輯案件">
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

      {userLoading || (initial === null && !error) ? (
        <LoadingPage text="載入案件資料…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => router.reload()} />
      ) : !isAdmin ? (
        <AccessDenied />
      ) : (
        <>
          <div className="mb-4">
            <h1 className="text-lg font-bold text-gray-800">編輯案件</h1>
            <p className="mt-0.5 text-xs text-gray-400">{initial?.title}</p>
          </div>
          <CaseForm mode="edit" initial={initial} />
        </>
      )}
    </Layout>
  );
}
