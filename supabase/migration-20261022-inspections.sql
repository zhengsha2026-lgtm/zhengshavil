-- =====================================================================
-- 遷移脚本：會勘紀錄模組（可選擇性連結工作紀錄）
-- 執行對象：已執行過 schema.sql（或先前各次 migration）的 Supabase 專案
-- 執行方式：Supabase Dashboard > SQL Editor > 貼上執行
-- 重複執行安全（使用 if not exists / drop ... if exists）
-- =====================================================================

-- -----------------------------------------------------
-- 1. inspections 表（會勘紀錄）
--    work_id 選填：可連結工作；工作刪除時 work_id 自動清空（保留會勘紀錄）
-- -----------------------------------------------------

create table if not exists public.inspections (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  inspection_date date not null,
  location text,
  participants text,
  description text,
  conclusion text,
  notes text,
  work_id uuid references public.works(id) on delete set null,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists inspections_date_idx on public.inspections (inspection_date);
create index if not exists inspections_work_idx on public.inspections (work_id);

-- -----------------------------------------------------
-- 2. attachments 檢查約束放寬：允許 related_table = 'inspections'
--    （原有約束僅允許 properties / works，須先卸除再重建）
-- -----------------------------------------------------

alter table public.attachments drop constraint if exists attachments_related_table_check;

alter table public.attachments
  add constraint attachments_related_table_check
  check (related_table in ('properties', 'works', 'inspections'));

-- -----------------------------------------------------
-- 3. RLS（與 properties / works 一致：登入者可讀，僅 admin 可寫）
-- -----------------------------------------------------

alter table public.inspections enable row level security;

drop policy if exists "inspections_select_authenticated" on public.inspections;
create policy "inspections_select_authenticated"
  on public.inspections for select
  to authenticated
  using (true);

drop policy if exists "inspections_insert_admin" on public.inspections;
create policy "inspections_insert_admin"
  on public.inspections for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "inspections_update_admin" on public.inspections;
create policy "inspections_update_admin"
  on public.inspections for update
  to authenticated
  using (public.is_admin());

drop policy if exists "inspections_delete_admin" on public.inspections;
create policy "inspections_delete_admin"
  on public.inspections for delete
  to authenticated
  using (public.is_admin());

-- -----------------------------------------------------
-- 4. Storage Bucket：inspection-files（公開讀取，僅 admin 可上傳/刪除）
-- -----------------------------------------------------

insert into storage.buckets (id, name, public)
values ('inspection-files', 'inspection-files', true)
on conflict (id) do nothing;

drop policy if exists "inspection_files_public_read" on storage.objects;
create policy "inspection_files_public_read"
  on storage.objects for select
  using (bucket_id = 'inspection-files');

drop policy if exists "inspection_files_admin_insert" on storage.objects;
create policy "inspection_files_admin_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'inspection-files' and public.is_admin());

drop policy if exists "inspection_files_admin_update" on storage.objects;
create policy "inspection_files_admin_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'inspection-files' and public.is_admin());

drop policy if exists "inspection_files_admin_delete" on storage.objects;
create policy "inspection_files_admin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'inspection-files' and public.is_admin());
