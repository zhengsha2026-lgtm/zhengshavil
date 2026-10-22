import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import InspectionForm from '@/components/InspectionForm';
import { useUser } from '@/components/UserContext';
import { LoadingPage, AccessDenied } from '@/components/Feedback';

export default function NewInspectionPage() {
  const router = useRouter();
  const { isAdmin, loading } = useUser();
  // 從案件詳情頁進入：query 帶 case_id 自動選中該案件
  // 從工作詳情頁進入：query 帶 work_id，快速建立新案件時自動關聯該工作
  const [defaultCaseId, setDefaultCaseId] = useState(null);
  const [quickWorkId, setQuickWorkId] = useState(null);

  useEffect(() => {
    if (!router.isReady) return;
    setDefaultCaseId(router.query.case_id || null);
    setQuickWorkId(router.query.work_id || null);
  }, [router.isReady, router.query.case_id, router.query.work_id]);

  return (
    <Layout title="新增會勘">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-gray-800">新增會勘</h1>
        <p className="mt-0.5 text-xs text-gray-400">
          記錄現場勘查的狀況與結論；若還沒有案件，可在表單內快速建立
        </p>
      </div>

      {loading ? (
        <LoadingPage />
      ) : !isAdmin ? (
        <AccessDenied />
      ) : (
        <InspectionForm mode="new" defaultCaseId={defaultCaseId} quickWorkId={quickWorkId} />
      )}
    </Layout>
  );
}
