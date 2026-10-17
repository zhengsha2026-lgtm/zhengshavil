import Layout from '@/components/Layout';
import WorkForm from '@/components/WorkForm';
import { useUser } from '@/components/UserContext';
import { LoadingPage, AccessDenied } from '@/components/Feedback';

export default function NewWorkPage() {
  const { isAdmin, loading } = useUser();

  return (
    <Layout title="新增工作">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-gray-800">新增工作</h1>
        <p className="mt-0.5 text-xs text-gray-400">記錄里內建設與工作，可上傳施工前／中／後照片</p>
      </div>

      {loading ? (
        <LoadingPage />
      ) : !isAdmin ? (
        <AccessDenied />
      ) : (
        <WorkForm mode="new" />
      )}
    </Layout>
  );
}
