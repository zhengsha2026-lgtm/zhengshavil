import Layout from '@/components/Layout';
import PropertyForm from '@/components/PropertyForm';
import { useUser } from '@/components/UserContext';
import { LoadingPage, AccessDenied } from '@/components/Feedback';

export default function NewPropertyPage() {
  const { isAdmin, loading } = useUser();

  return (
    <Layout title="新增財產">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-gray-800">新增財產</h1>
        <p className="mt-0.5 text-xs text-gray-400">填寫里內財產資料，儲存後可繼續新增照片</p>
      </div>

      {loading ? (
        <LoadingPage />
      ) : !isAdmin ? (
        <AccessDenied />
      ) : (
        <PropertyForm mode="new" />
      )}
    </Layout>
  );
}
