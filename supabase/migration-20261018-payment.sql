-- =====================================================================
-- 遷移脚本：工作紀錄支援分次付款（已支出／未支出）
-- 執行對象：已執行過 migration-20261018-work-progress.sql 的 Supabase 專案
-- （全新專案直接執行最新版 schema.sql 即可，不需此檔）
-- 執行方式：Supabase Dashboard > SQL Editor > 貼上執行
-- 重複執行安全（使用 if not exists）
-- =====================================================================

-- -----------------------------------------------------
-- 1. works：新增 total_amount（合約／預計總金額，選填）
--    既有 cost 欄位保留，改為系統同步「已支出」加總使用
-- -----------------------------------------------------

alter table public.works add column if not exists total_amount numeric;

-- -----------------------------------------------------
-- 2. work_progress：新增 payment_amount（本次付款金額，預設 0）
-- -----------------------------------------------------

alter table public.work_progress add column if not exists payment_amount numeric default 0;
