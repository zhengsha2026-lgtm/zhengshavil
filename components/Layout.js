import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Head from 'next/head';
import { useUser } from '@/components/UserContext';
import { createClient } from '@/lib/supabaseBrowser';

const NAV_ITEMS = [
  { href: '/', label: '首頁', icon: 'home' },
  { href: '/properties', label: '財產紀錄', icon: 'box' },
  { href: '/works', label: '工作紀錄', icon: 'wrench' },
  { href: '/inspections', label: '會勘紀錄', icon: 'clipboard' },
];

function NavIcon({ name, active }) {
  const stroke = active ? '#7a2fe8' : '#9ca3af';
  const paths = {
    home: <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5L12 3l9 7.5M5 9.5V21h14V9.5" />,
    box: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20 7l-8-4-8 4v10l8 4 8-4V7zM4 7l8 4 8-4M12 11v10"
      />
    ),
    wrench: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.42 15.17L17.73 19a2 2 0 002.73-.73l.4-.69a2 2 0 00-.73-2.73l-6.31-3.82m0 0l-3.8-6.31A2 2 0 006.5 3.62l-.69.4a2 2 0 00-.73 2.73l3.82 6.31m2.52 2.11l-2.52-2.11"
      />
    ),
    clipboard: (
      <>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
        />
      </>
    ),
  };
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke={stroke} strokeWidth="1.8">
      {paths[name]}
    </svg>
  );
}

function UserChip() {
  const { user, profile } = useUser();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (!user) return null;
  const name = profile?.full_name || user.email?.split('@')[0] || '使用者';

  return (
    <div className="flex items-center gap-2.5">
      <div className="hidden text-right sm:block">
        <p className="text-sm font-medium leading-tight text-gray-700">{name}</p>
        <p className="text-xs leading-tight text-gray-400">
          {profile?.role === 'admin' ? '管理員' : '查詢使用者'}
        </p>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        disabled={busy}
        className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
      >
        登出
      </button>
    </div>
  );
}

export default function Layout({ children, title }) {
  const { pathname } = useRouter();
  return (
    <div className="flex min-h-screen flex-col">
      <Head>
        <title>{title ? `${title} - 正砂里紀錄系統` : '正砂里內財產與建設紀錄系統'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/png" href="/logo.png" />
      </Head>

      {/* 頂部導覽列 */}
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            {/* LOGO 圖片；載入失敗（如檔案尚未放置）自動退回「正」字圖示 */}
            <img
              src="/logo.png"
              alt="正砂里"
              className="h-10 w-auto object-contain"
              style={{ height: '2.5rem', width: 'auto', objectFit: 'contain' }}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling.style.display = 'flex';
              }}
            />
            <span
              className="hidden h-8 w-8 items-center justify-center rounded-xl bg-accent-600 text-sm font-bold text-white"
              style={{ display: 'none' }}
            >
              正
            </span>
            <span className="text-[15px] font-semibold text-gray-800">正砂里紀錄系統</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => {
              const active =
                item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
                    active ? 'bg-accent-50 text-accent-700' : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <UserChip />
        </div>
      </header>

      {/* 主內容 */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-5 md:pb-10">{children}</main>

      {/* 手機底部導覽列 */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-100 bg-white/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-4">
          {NAV_ITEMS.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
                  active ? 'text-accent-600' : 'text-gray-400'
                }`}
              >
                <NavIcon name={item.icon} active={active} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
