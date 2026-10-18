export function formatCurrency(value) {
  if (value === null || value === undefined || value === '') return '-';
  const num = Number(value);
  if (Number.isNaN(num)) return '-';
  return 'NT$' + num.toLocaleString('zh-TW', { maximumFractionDigits: 2 });
}

export function formatDate(value) {
  if (!value) return '-';
  // 日期字串（yyyy-mm-dd）直接拆解，避免時區位移
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-');
    return `${y}/${m}/${d}`;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

export function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function monthStartStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${m}-01`;
}

export function monthEndStr() {
  const d = new Date();
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const m = String(next.getMonth() + 1).padStart(2, '0');
  const day = String(next.getDate()).padStart(2, '0');
  return `${next.getFullYear()}-${m}-${day}`;
}

/**
 * 計算工作進行天數（含起訖當日）
 * - 無 endDate 時以今天計算（進行中）
 * - 回傳最小 1（同日開始結束視為 1 天）
 */
export function calcWorkDays(startDate, endDate) {
  if (!startDate) return 0;
  const start = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return 0;
  const end = endDate ? new Date(`${endDate}T00:00:00`) : new Date();
  if (Number.isNaN(end.getTime())) return 0;
  end.setHours(0, 0, 0, 0);
  const diff = Math.round((end - start) / 86400000) + 1;
  return Math.max(diff, 1);
}
