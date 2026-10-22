import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import CaseForm from '@/components/CaseForm';
import { useUser } from '@/components/UserContext';
import { LoadingPage, AccessDenied } from '@/components/Feedback';

export default function NewCasePage() {
  const router = useRouter();
  const { isAdmin, loading } = useUser();
  // 從工作詳情頁進入時，query 帶 work_id 自動關聯
  const [defaultWorkId, setDefaultWorkId] = useState(null);

  useEffect(() => {
    if (!router.isReady) return;
    setDefaultWorkId(router.query.work_id || null);
  }, [router.isReady, router.query.work_id]);

  return (
    <Layout title="新增案件">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-gray-800">新增案件</h1>
        <p className="mt-0.5 text-xs text-gray-400">以案件管理會勘；單次會勘也能先建案件再記錄</p>
      </div>

      {loading ? (
        <LoadingPage />
      ) : !isAdmin ? (
        <AccessDenied />
      ) : (
        <CaseForm mode="new" defaultWorkId={defaultWorkId} />
      )}
    </Layout>
  );
}
