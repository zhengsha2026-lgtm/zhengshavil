-- =====================================================================
-- 遷移脚本：會勘改為「案件」為單位（會勘一定屬於案件）
-- 執行對象：已執行過 schema.sql 及先前各次 migration 的 Supabase 專案
-- 執行方式：Supabase Dashboard > SQL Editor > 貼上執行
-- 重複執行安全（使用 if not exists / drop ... if exists / 條件回填）
-- =====================================================================

-- -----------------------------------------------------
-- 1. cases 表（案件）
--    會勘統一掛在案件下；案件可選擇性連結工作
-- -----------------------------------------------------

create table if not exists public.cases (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  location text,
  status text default 'in_progress' check (status in ('in_progress', 'completed')),
  work_id uuid references public.works(id) on delete set null,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists cases_work_idx on public.cases (work_id);
create index if not exists cases_status_idx on public.cases (status);

-- -----------------------------------------------------
-- 2. inspections 表新增欄位
--    case_id：會勘一定屬於案件（稍後設 not null）
--    stage：會勘階段（初勘、複勘、完工會勘等，自由文字）
--    work_id 保留（向後相容），建議優先使用案件的 work_id
-- -----------------------------------------------------

alter table public.inspections add column if not exists case_id uuid references public.cases(id) on delete cascade;
alter table public.inspections add column if not exists stage text;

create index if not exists inspections_case_idx on public.inspections (case_id);

-- -----------------------------------------------------
-- 3. 既有會勘資料回填
--    每筆沒有 case_id 的既有會勘，各自建立一個案件
--    （案件名稱沿用會勘標題、地點與關聯工作一併帶入）
--    以 title + created_at 對應，可重複執行（只處理 case_id is null 者）
-- -----------------------------------------------------

with new_cases as (
  insert into public.cases (title, description, location, work_id, created_by, created_at)
  select i.title, i.description, i.location, i.work_id, i.created_by, i.created_at
  from public.inspections i
  where i.case_id is null
  returning id, title, created_at
)
update public.inspections i
set case_id = nc.id
from new_cases nc
where i.case_id is null
  and i.title = nc.title
  and i.created_at = nc.created_at;

-- 回填完成後，case_id 設為必填（若仍有 null 會在此報錯，代表回填未完成）
alter table public.inspections alter column case_id set not null;

-- -----------------------------------------------------
-- 4. RLS（cases 與現有相同：登入者可讀，僅 admin 可寫）
-- -----------------------------------------------------

alter table public.cases enable row level security;

drop policy if exists "cases_select_authenticated" on public.cases;
create policy "cases_select_authenticated"
  on public.cases for select
  to authenticated
  using (true);

drop policy if exists "cases_insert_admin" on public.cases;
create policy "cases_insert_admin"
  on public.cases for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "cases_update_admin" on public.cases;
create policy "cases_update_admin"
  on public.cases for update
  to authenticated
  using (public.is_admin());

drop policy if exists "cases_delete_admin" on public.cases;
create policy "cases_delete_admin"
  on public.cases for delete
  to authenticated
  using (public.is_admin());
