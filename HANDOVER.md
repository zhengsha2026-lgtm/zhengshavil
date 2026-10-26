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
| `works` | 主工作（標題、分類、開始/結束日期、地點、說明、執行者、費用、狀態） |
| `work_progress` | 工作進度紀錄（關聯 works、進度日期、說明） |
| `attachments` | 照片附件（關聯 properties/works、file_path、caption、可選 progress_id 關聯進度） |

Storage buckets：`property-files`、`work-files`（皆公開讀取、僅 admin 可上傳）

### 工作紀錄模型（2026-10-18 起）

- 一筆主工作（`works`）＋多筆進度紀錄（`work_progress`），支援長時間工作
- 進行天數計算（含頭尾）：進行中 = 今天 − start_date；已完成 = end_date − start_date（無 end_date 用今天）
- 進度照片：`attachments.progress_id` 關聯；主工作照片：`progress_id` 為 null
- 刪除主工作會串聯刪除進度與所有照片；刪除進度會串聯刪除其照片
- 既有資料庫升級：執行 `supabase/migration-20261018-work-progress.sql`

### 分次付款模型（2026-10-18 起）

- 主工作填 `total_amount`（合約／預計總金額，選填）；進度紀錄填 `payment_amount`（本次付款，選填）
- 已支出 = 該工作所有進度付款加總（同步寫入 `works.cost`，供首頁月支出統計使用）
- 未支出 = total_amount − 已支出（僅有填總金額時顯示；負值代表超付）
- 進度新增／編輯／刪除後自動同步已支出（`syncWorkCost`）
- 既有資料庫升級：執行 `supabase/migration-20261018-payment.sql`

## 安全與權限（RLS）

- `profiles`：使用者僅可讀自己；admin 可讀全部、可更新（改 role）
- `properties` / `works` / `work_progress` / `attachments`：所有登入者可 SELECT；僅 admin 可 INSERT / UPDATE / DELETE
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
│   ├── WorkForm.js         # 工作新增/編輯表單（start/end 日期）
│   ├── ProgressFormModal.js # 進度紀錄新增/編輯 modal（時間軸用）
│   ├── AttachmentEditor.js # 照片上傳元件（caption 標示、自動壓縮）
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

## 圖示規範（lucide-react）

新功能一律使用 `lucide-react` 圖示，透過 `components/icons.js` 的包裝元件保持一致：

| 使用情境 | 尺寸 | 顏色 | 線寬 | 包裝元件 |
|----------|------|------|------|----------|
| 統計卡片 | 24px | accent-600 | 1.75 | `StatIcon` |
| 空狀態 | 48px | gray-300 | 1.5 | `EmptyIcon` |
| 列表／操作按鈕 | 18–20px | gray-500 / accent | 1.75 | `ActionIcon` |
| 導覽列 | 22px | 依狀態 | 1.75 | `NavIcon` |

用法：`<StatIcon icon={Package} />`，圖示名稱查 https://lucide.dev/icons

## 更新紀錄

- 2026-10-26：匯出功能擴充（工作頁新增「完整報表（含案件／會勘）」Excel 五工作表：摘要／工作總表／進度明細／案件總表／會勘明細與 PDF 依工作分組；案件頁新增匯出 Excel（摘要／案件總表／會勘明細）與 PDF；所有匯出依目前篩選條件、含 W001／C001／I001 流水號與筆數統計；PDF 工具抽至 lib/exportShared.js）
- 2026-10-26：工作紀錄匯出功能（/works 列表依目前篩選條件匯出 Excel 與 PDF；Excel 兩個工作表：工作總表＋進度明細；PDF 為簡易報表格式含篩選條件說明與各工作進度摘要，中文以 html2canvas 渲染完整顯示；xlsx/jspdf/html2canvas 皆動態載入；無資料時提示「無符合條件的資料」）
- 2026-10-22：會勘改為「案件」為單位（新增 cases 表，inspections 加 case_id 必填＋stage 欄位；新增 /cases 列表／詳情／新增／編輯頁；會勘表單必選所屬案件、可快速建立新案件不跳頁；會勘階段支援初勘／複勘／完工會勘或自由輸入；工作詳情頁改顯示相關案件；導覽列改為案件入口；既有會勘自動回填為各自案件；須執行 migration-20261022-cases.sql）
- 2026-10-22：新增會勘紀錄模組（inspections 表可選擇性關聯工作；/inspections 列表支援搜尋＋日期篩選、詳情頁顯示關聯工作可跳轉、新增／編輯表單含關聯工作下拉與照片上傳至 inspection-files bucket；工作詳情頁新增「相關會勘」區塊；導覽列加入會勘入口；須執行 migration-20261022-inspections.sql）
- 2026-10-20：進度表單支援「本次為完工」一鍵結案（勾選後顯示結束日期欄位，預設帶入進度日期；儲存時同步主工作為已完成＋結束日期；編輯結案進度可取消勾選，主工作自動回到進行中並清空結束日期；結束日期驗證不得早於開始日期）
- 2026-10-18：視覺強化（統計卡片淺色底＋左側色條：財產藍／工作紫／金額綠；列表卡片加色條、標題加粗、金額放大變色；狀態標籤飽和度提高；天數／筆數／支出改 info-tag 小標籤；篩選區改淺灰背景與列表區隔；新增 globals.css 通用樣式 card-bar／info-tag）
- 2026-10-18：全站圖示統一改用 lucide-react（移除 @heroicons/react），建立 components/icons.js 圖示規範（StatIcon/EmptyIcon/ActionIcon/NavIcon），首頁統計卡片與空狀態圖示更新
- 2026-10-18：工作紀錄支援分次付款（works 新增 total_amount、work_progress 新增 payment_amount；主工作表單以總金額取代手動費用、進度可記錄付款；列表與詳情顯示已支出／未支出、時間軸顯示每筆付款；cost 改為系統同步已支出；須執行 migration-20261018-payment.sql）
- 2026-10-18：工作紀錄支援長時間工作與進度紀錄（works 拆分 start_date/end_date、新增 work_progress 表、attachments 增加 progress_id；列表顯示進行天數與進度筆數、詳情頁時間軸＋進度 CRUD；須執行 migration-20261018-work-progress.sql）
- 2026-10-17：修正照片顯示（縮圖改固定高度 + object-cover，燈箱改 object-contain 完整顯示，改用 inline style 確保舊版手機瀏覽器相容）；新增「拍照」按鈕（手機可直接開啟相機，capture="environment"）
- 2026-10-17：新增照片上傳前自動壓縮（browser-image-compression：最長邊 1600px、品質 0.75、目標 800KB 以下；壓縮失敗自動退回原始檔案；處理中顯示載入狀態）
