-- =====================================================
-- 正砂里內財產與建設紀錄系統 - Supabase 初始化腳本
-- 於 Supabase Dashboard > SQL Editor 整段執行
-- =====================================================

-- -----------------------------------------------------
-- 1. 資料表
-- -----------------------------------------------------

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  role text default 'viewer' check (role in ('admin', 'viewer')),
  created_at timestamptz default now()
);

create table if not exists public.properties (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  category text not null,
  quantity integer default 1,
  acquired_date date,
  acquired_method text check (acquired_method in ('handover', 'purchase')),
  amount numeric,
  location text,
  status text default 'in_use' check (status in ('in_use', 'scrapped', 'lost')),
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.works (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  category text not null,
  start_date date not null,
  end_date date,
  location text,
  description text,
  executor text,
  cost numeric,          -- 系統同步：已支出（進度付款加總）
  total_amount numeric,  -- 合約／預計總金額（選填）
  status text default 'completed' check (status in ('in_progress', 'completed')),
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.work_progress (
  id uuid default gen_random_uuid() primary key,
  work_id uuid references public.works(id) on delete cascade not null,
  progress_date date not null,
  description text,
  payment_amount numeric default 0,  -- 本次付款金額（選填）
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.inspections (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  inspection_date date not null,
  location text,
  participants text,
  description text,
  conclusion text,
  notes text,
  work_id uuid references public.works(id) on delete set null,  -- 選填，可連結工作
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists inspections_date_idx on public.inspections (inspection_date);
create index if not exists inspections_work_idx on public.inspections (work_id);

create table if not exists public.attachments (
  id uuid default gen_random_uuid() primary key,
  related_table text not null check (related_table in ('properties', 'works', 'inspections')),
  related_id uuid not null,
  file_path text not null,
  file_type text default 'image',
  caption text,
  progress_id uuid references public.work_progress(id) on delete cascade,
  created_at timestamptz default now()
);

create index if not exists attachments_related_idx on public.attachments (related_table, related_id);
create index if not exists attachments_progress_idx on public.attachments (progress_id);
create index if not exists properties_category_idx on public.properties (category);
create index if not exists properties_acquired_date_idx on public.properties (acquired_date);
create index if not exists works_category_idx on public.works (category);
create index if not exists works_start_date_idx on public.works (start_date);
create index if not exists work_progress_work_idx on public.work_progress (work_id, progress_date);

-- -----------------------------------------------------
-- 2. updated_at 自動更新
-- -----------------------------------------------------

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists properties_updated_at on public.properties;
create trigger properties_updated_at
  before update on public.properties
  for each row execute function public.handle_updated_at();

drop trigger if exists works_updated_at on public.works;
create trigger works_updated_at
  before update on public.works
  for each row execute function public.handle_updated_at();

drop trigger if exists work_progress_updated_at on public.work_progress;
create trigger work_progress_updated_at
  before update on public.work_progress
  for each row execute function public.handle_updated_at();

-- -----------------------------------------------------
-- 3. 新使用者自動建立 profile（預設 viewer，之後由管理員調整）
--    管理員在 Dashboard 建立帳號後，可直接在 profiles 表將 role 改為 admin
-- -----------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    'viewer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------
-- 4. RLS 政策
-- -----------------------------------------------------

alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.works enable row level security;
alter table public.work_progress enable row level security;
alter table public.attachments enable row level security;

-- 管理員判斷函式
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- profiles：使用者可讀自己；admin 可讀全部、可更新
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin"
  on public.profiles for select
  using (public.is_admin());

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
  on public.profiles for update
  using (public.is_admin());

-- properties：登入者可登入者可讀；僅 admin 可寫
drop policy if exists "properties_select_authenticated" on public.properties;
create policy "properties_select_authenticated"
  on public.properties for select
  to authenticated
  using (true);

drop policy if exists "properties_insert_admin" on public.properties;
create policy "properties_insert_admin"
  on public.properties for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "properties_update_admin" on public.properties;
create policy "properties_update_admin"
  on public.properties for update
  to authenticated
  using (public.is_admin());

drop policy if exists "properties_delete_admin" on public.properties;
create policy "properties_delete_admin"
  on public.properties for delete
  to authenticated
  using (public.is_admin());

-- works：登入者可讀；僅 admin 可寫
drop policy if exists "works_select_authenticated" on public.works;
create policy "works_select_authenticated"
  on public.works for select
  to authenticated
  using (true);

drop policy if exists "works_insert_admin" on public.works;
create policy "works_insert_admin"
  on public.works for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "works_update_admin" on public.works;
create policy "works_update_admin"
  on public.works for update
  to authenticated
  using (public.is_admin());

drop policy if exists "works_delete_admin" on public.works;
create policy "works_delete_admin"
  on public.works for delete
  to authenticated
  using (public.is_admin());

-- work_progress：登入者可讀；僅 admin 可寫
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

-- inspections：登入者可讀；僅 admin 可寫
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

-- attachments：登入者可讀；僅 admin 可寫
drop policy if exists "attachments_select_authenticated" on public.attachments;
create policy "attachments_select_authenticated"
  on public.attachments for select
  to authenticated
  using (true);

drop policy if exists "attachments_insert_admin" on public.attachments;
create policy "attachments_insert_admin"
  on public.attachments for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "attachments_update_admin" on public.attachments;
create policy "attachments_update_admin"
  on public.attachments for update
  to authenticated
  using (public.is_admin());

drop policy if exists "attachments_delete_admin" on public.attachments;
create policy "attachments_delete_admin"
  on public.attachments for delete
  to authenticated
  using (public.is_admin());

-- -----------------------------------------------------
-- 5. Storage Buckets（公開讀取，僅 admin 可上傳/刪除）
-- -----------------------------------------------------

insert into storage.buckets (id, name, public)
values ('property-files', 'property-files', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('work-files', 'work-files', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('inspection-files', 'inspection-files', true)
on conflict (id) do nothing;

-- property-files 政策
drop policy if exists "property_files_public_read" on storage.objects;
create policy "property_files_public_read"
  on storage.objects for select
  using (bucket_id = 'property-files');

drop policy if exists "property_files_admin_insert" on storage.objects;
create policy "property_files_admin_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'property-files' and public.is_admin());

drop policy if exists "property_files_admin_update" on storage.objects;
create policy "property_files_admin_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'property-files' and public.is_admin());

drop policy if exists "property_files_admin_delete" on storage.objects;
create policy "property_files_admin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'property-files' and public.is_admin());

-- work-files 政策
drop policy if exists "work_files_public_read" on storage.objects;
create policy "work_files_public_read"
  on storage.objects for select
  using (bucket_id = 'work-files');

drop policy if exists "work_files_admin_insert" on storage.objects;
create policy "work_files_admin_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'work-files' and public.is_admin());

drop policy if exists "work_files_admin_update" on storage.objects;
create policy "work_files_admin_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'work-files' and public.is_admin());

drop policy if exists "work_files_admin_delete" on storage.objects;
create policy "work_files_admin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'work-files' and public.is_admin());

-- inspection-files 政策
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

-- -----------------------------------------------------
-- 6. 第一個 admin 帳號設定方式
--    (1) 於 Authentication > Users 建立 Email/Password 使用者
--    (2) 執行下列 SQL（將 email 換成實際帳號）：
--
--    update public.profiles set role = 'admin'
--    where id = (select id from auth.users where email = 'admin@example.com');
-- -----------------------------------------------------
