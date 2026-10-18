-- =====================================================================
-- 遷移脚本：工作紀錄支援長時間工作與進度紀錄
-- 執行對象：已部署過原版 schema.sql 的 Supabase 專案
-- （全新專案直接執行最新版 schema.sql 即可，不需此檔）
-- 執行方式：Supabase Dashboard > SQL Editor > 貼上執行
-- 重複執行安全（使用 if not exists / 欄位存在判斷）
-- =====================================================================

-- -----------------------------------------------------
-- 1. works：work_date 改名為 start_date（必填）、新增 end_date
-- -----------------------------------------------------

alter table public.works rename column work_date to start_date;

-- 補值：日期缺漏的舊資料以建立日代替，避免 NOT NULL 約束失敗
update public.works
set start_date = created_at::date
where start_date is null;

alter table public.works alter column start_date set not null;

alter table public.works add column if not exists end_date date;

-- 索引更名（原 work_date 索引隨欄位改名而存在，僅更名為一致命名）
alter index if exists works_work_date_idx rename to works_start_date_idx;

-- -----------------------------------------------------
-- 2. 新增 work_progress 表（進度紀錄）
-- -----------------------------------------------------

create table if not exists public.work_progress (
  id uuid default gen_random_uuid() primary key,
  work_id uuid references public.works(id) on delete cascade not null,
  progress_date date not null,
  description text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists work_progress_work_idx on public.work_progress (work_id, progress_date);

-- updated_at 自動更新（複用 schema.sql 已建立的函式）
drop trigger if exists work_progress_updated_at on public.work_progress;
create trigger work_progress_updated_at
  before update on public.work_progress
  for each row execute function public.handle_updated_at();

-- -----------------------------------------------------
-- 3. attachments：新增可選 progress_id（關聯進度照片）
-- -----------------------------------------------------

alter table public.attachments
  add column if not exists progress_id uuid references public.work_progress(id) on delete cascade;

create index if not exists attachments_progress_idx on public.attachments (progress_id);

-- -----------------------------------------------------
-- 4. work_progress RLS：登入者可讀；僅 admin 可寫
-- -----------------------------------------------------

alter table public.work_progress enable row level security;

drop policy if exists "work_progress_select_authenticated" on public.work_progress;
create policy "work_progress_select_authenticated"
  on public.work_progress for select
  to authenticated
  using (true);

drop policy if exists "work_progress_insert_admin" on public.work_progress;
create policy "work_progress_insert_admin"
  on public.work_progress for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "work_progress_update_admin" on public.work_progress;
create policy "work_progress_update_admin"
  on public.work_progress for update
  to authenticated
  using (public.is_admin());

drop policy if exists "work_progress_delete_admin" on public.work_progress;
create policy "work_progress_delete_admin"
  on public.work_progress for delete
  to authenticated
  using (public.is_admin());
