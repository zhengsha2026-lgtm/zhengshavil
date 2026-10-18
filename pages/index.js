import { useEffect, useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { createClient } from '@/lib/supabaseBrowser';
import { monthStartStr, monthEndStr, formatDate, formatCurrency } from '@/lib/format';
import StatusBadge, { CategoryBadge } from '@/components/StatusBadge';
import { LoadingPage, EmptyState } from '@/components/Feedback';
import { useUser } from '@/components/UserContext';
import { StatIcon, EmptyIcon } from '@/components/icons';
import { Package, Wrench, Banknote, ClipboardList } from 'lucide-react';

function StatCard({ icon, label, value, sub, tone = 'blue' }) {
  const tones = {
    blue: 'card-bar-blue bg-blue-50/50',
    purple: 'card-bar-purple bg-accent-50/40',
    green: 'card-bar-green bg-emerald-50/50',
  };
  return (
    <div className={`card card-bar flex items-center gap-3.5 p-4 ${tones[tone]}`}>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/80">
        <StatIcon icon={icon} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="mt-0.5 truncate text-xl font-bold leading-snug text-gray-800">{value}</p>
        {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

function SectionHeader({ title, href }) {
  return (
    <div className="mb-3 mt-2 flex items-center justify-between">
      <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
      <Link
        href={href}
        className="flex items-center gap-0.5 text-xs font-medium text-accent-600 hover:text-accent-700"
      >
        查看全部
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  );
}

export default function HomePage() {
  const { profile } = useUser();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ propertyCount: 0, monthWorks: 0, monthExpense: 0 });
  const [recentProperties, setRecentProperties] = useState([]);
  const [recentWorks, setRecentWorks] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const supabase = createClient();
        const from = monthStartStr();
        const to = monthEndStr();

        const [propCount, monthWorks, monthProperties] = await Promise.all([
          supabase.from('properties').select('id', { count: 'exact', head: true }),
          supabase
            .from('works')
            .select('id, cost')
            .gte('start_date', from)
            .lte('start_date', to),
          supabase
            .from('properties')
            .select('id, amount')
            .gte('acquired_date', from)
            .lte('acquired_date', to),
        ]);
        if (cancelled) return;

        const worksCost = (monthWorks.data || []).reduce((sum, w) => sum + (Number(w.cost) || 0), 0);
        const propsAmount = (monthProperties.data || []).reduce(
          (sum, p) => sum + (Number(p.amount) || 0),
          0
        );

        setStats({
          propertyCount: propCount.count || 0,
          monthWorks: (monthWorks.data || []).length,
          monthExpense: worksCost + propsAmount,
        });

        const [recentProps, recentWs] = await Promise.all([
          supabase
            .from('properties')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5),
          supabase.from('works').select('*').order('created_at', { ascending: false }).limit(5),
        ]);
        if (cancelled) return;

        setRecentProperties(recentProps.data || []);
        setRecentWorks(recentWs.data || []);
      } catch (err) {
        console.error('首頁載入失敗', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const monthName = `${new Date().getMonth() + 1} 月`;

  return (
    <Layout>
      {/* 挨招呼區 */}
      <div className="mb-5">
        <h1 className="text-lg font-bold text-gray-800">
          {profile?.full_name ? `${profile.full_name}，你好` : '你好'}
        </h1>
        <p className="mt-0.5 text-xs text-gray-400">
          {profile?.role === 'admin' ? '管理員模式：可新增／編輯／刪除紀錄' : '帳號權限：查詢'}
        </p>
      </div>

      {loading ? (
        <LoadingPage text="載入統計資料…" />
      ) : (
        <>
          {/* 統計卡片 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard icon={Package} tone="blue" label="財產總筆數" value={`${stats.propertyCount} 筆`} />
            <StatCard icon={Wrench} tone="purple" label={`${monthName}工作筆數`} value={`${stats.monthWorks} 筆`} />
            <StatCard
              icon={Banknote}
              tone="green"
              label={`${monthName}支出總額`}
              value={formatCurrency(stats.monthExpense)}
              sub="含財產採購與工作費用"
            />
          </div>

          {/* 最近財產 */}
          <div className="mt-6">
            <SectionHeader title="最近財產" href="/properties" />
            {recentProperties.length === 0 ? (
              <div className="card">
                <EmptyState icon={<EmptyIcon icon={Package} />} title="尚無財產紀錄" />
              </div>
            ) : (
              <div className="space-y-3">
                {recentProperties.map((item) => (
                  <Link key={item.id} href={`/properties/${item.id}`} className="card card-bar card-bar-blue block p-4 transition-shadow hover:shadow-soft">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-[15px] font-bold text-gray-800">{item.name}</h3>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <CategoryBadge>{item.category}</CategoryBadge>
                          <StatusBadge type="property" value={item.status} />
                        </div>
                        <p className="mt-1.5 text-xs text-gray-400">{formatDate(item.acquired_date)}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        {item.amount != null && (
                          <p className="text-base font-bold text-blue-600">{formatCurrency(item.amount)}</p>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* 最近工作 */}
          <div className="mt-6">
            <SectionHeader title="最近工作" href="/works" />
            {recentWorks.length === 0 ? (
              <div className="card">
                <EmptyState icon={<EmptyIcon icon={ClipboardList} />} title="尚無工作紀錄" />
              </div>
            ) : (
              <div className="space-y-3">
                {recentWorks.map((item) => (
                  <Link key={item.id} href={`/works/${item.id}`} className="card card-bar card-bar-purple block p-4 transition-shadow hover:shadow-soft">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-[15px] font-bold text-gray-800">{item.title}</h3>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <CategoryBadge>{item.category}</CategoryBadge>
                          <StatusBadge type="work" value={item.status} />
                        </div>
                        <p className="mt-1.5 text-xs text-gray-400">
                          {formatDate(item.start_date)}
                          {item.end_date ? ` ~ ${formatDate(item.end_date)}` : ''}
                          {item.location ? ` · ${item.location}` : ''}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {item.cost != null && (
                          <p className="text-base font-bold text-accent-600">{formatCurrency(item.cost)}</p>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </Layout>
  );
}
