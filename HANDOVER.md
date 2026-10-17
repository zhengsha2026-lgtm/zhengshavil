# 正砂里內財產與建設紀錄系統 - 交接文件

## 系統簡介

選後里內使用的財產與建設／工作紀錄系統，讓里內財產與建設成果透明可查、可展示。

- **技術棧**：Next.js 14（Pages Router）+ Supabase（Auth + Database + Storage）+ Tailwind CSS
- **部署**：Vercel（從 GitHub main 分支自動部署）
- **權限**：admin 可新增／編輯／刪除；viewer 僅可查詢

## 功能模組

| 模組 | 路徑 | 說明 |
|------|------|------|
| 登入 | `/login` | Email + 密碼（不開放自行註冊） |
| 首頁 | `/` | 統計卡片（財產總數、本月工作、本月支出）＋ 最近 5 筆紀錄 |
| 財產 | `/properties` | 列表（分類／狀態／日期篩選＋關鍵字搜尋＋分頁）、詳情、新增／編輯 |
| 工作 | `/works` | 同上，照片可標示「施工前／中／後」 |

## 第一次設定步驟

### 1. 建立 Supabase 專案

1. 到 [supabase.com](https://supabase.com) 建立新專案
2. SQL Editor 執行 `supabase/schema.sql`（含資料表、RLS、Storage buckets、觸發器）

### 2. 建立第一個 admin 帳號

1. Supabase Dashboard > Authentication > Users > **Add user**
   - 填入 Email / 密碼（勾選 Auto Confirm）
2. SQL Editor 執行（email 換成實際帳號）：

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'admin@example.com');
```

> 之後新增一般使用者：同樣在 Authentication 建立帳號即可，profile 會自動建立（預設 viewer）。

### 3. 本機開發

```bash
npm install
copy .env.local.example .env.local   # 填入 Supabase URL 與 anon key
npm run dev
```

### 4. 部署至 Vercel

1. 專案推上 GitHub
2. Vercel 匯入專案（Framework 自動偵測 Next.js）
3. 設定 Environment Variables：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy

## 資料表結構

| 資料表 | 用途 |
|--------|------|
| `profiles` | 使用者資料（full_name、role: admin/viewer） |
| `properties` | 財產（名稱、分類、數量、取得日期/方式、金額、位置、狀態） |
| `works` | 工作紀錄（標題、分類、日期、地點、說明、執行者、費用、狀態） |
| `attachments` | 照片附件（關聯 properties/works、file_path、caption） |

Storage buckets：`property-files`、`work-files`（皆公開讀取、僅 admin 可上傳）

## 安全與權限（RLS）

- `profiles`：使用者僅可讀自己；admin 可讀全部、可更新（改 role）
- `properties` / `works` / `attachments`：所有登入者可 SELECT；僅 admin 可 INSERT / UPDATE / DELETE
- Storage：兩個 bucket 公開讀取；僅 admin 可上傳／刪除

## 程式結構

```
├── middleware.js          # 路由保護（未登入導向 /login）
├── supabase/schema.sql    # 資料庫初始化 SQL
├── lib/
│   ├── supabaseBrowser.js  # Supabase client
│   ├── constants.js        # 固定分類與選項
│   ├── format.js           # 日期/金額格式化
│   └── api.js              # 附件上傳/刪除共用邏輯
├── components/
│   ├── Layout.js           # 版面（頂部導覽＋手機底部導覽列）
│   ├── UserContext.js      # 登入狀態與角色
│   ├── PropertyForm.js     # 財產新增/編輯表單
│   ├── WorkForm.js         # 工作新增/編輯表單
│   ├── AttachmentEditor.js # 照片上傳元件（caption 標示）
│   ├── PhotoWall.js        # 照片牆（點擊放大燈箱）
│   ├── ConfirmDialog.js    # 刪除二次確認
│   ├── Pagination.js       # 分頁
│   └── Feedback.js          # 載入/空入/空狀態/權限提示
└── pages/                  # 規格所列之 10 個路由
```

## 後續擴充建議

- 分類目前寫死在前端 `lib/constants.js`，之後可改成資料表設定
- 可加入匯出 Excel（財產清冊／工作月報）
- 可加入管理員建立帳號的介面（目前於 Supabase Dashboard 操作）
