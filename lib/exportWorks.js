import { createClient } from '@/lib/supabaseBrowser';
import { formatDate, formatCurrency } from '@/lib/format';
import { escapeSearchKeyword } from '@/lib/api';
import { WORK_STATUS_OPTIONS } from '@/lib/constants';

const WORK_STATUS_MAP = WORK_STATUS_OPTIONS.reduce((m, o) => ({ ...m, [o.value]: o.label }), {});

/**
 * 工作紀錄匯出（Excel / PDF）
 * 依傳入的篩選條件抓取「全部」符合的工作（不分頁）＋進度明細＋關聯會勘階段
 */

// -----------------------------------------------------
// 資料抓取
// -----------------------------------------------------

function applyWorkFilters(query, filters, kw) {
  if (filters.category) query = query.eq('category', filters.category);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.dateFrom) query = query.gte('start_date', filters.dateFrom);
  if (filters.dateTo) query = query.lte('start_date', filters.dateTo);
  if (kw) {
    query = query.or(`title.ilike.%${kw}%,location.ilike.%${kw}%,description.ilike.%${kw}%`);
  }
  return query;
}

/**
 * 抓取全部符合篩選的工作（每次 1000 筆循環）＋每筆工作的進度與會勘階段
 */
export async function fetchWorksForExport(filters, keyword) {
  const supabase = createClient();
  const kw = escapeSearchKeyword(keyword);

  // 1. 全部工作
  const works = [];
  let from = 0;
  while (true) {
    let query = applyWorkFilters(supabase.from('works').select('*'), filters, kw);
    query = query
      .order('start_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(from, from + 999);
    const { data, error } = await query;
    if (error) throw error;
    works.push(...(data || []));
    if (!data || data.length < 1000) break;
    from += 1000;
  }

  // 2. 進度明細（分批 in 查詢）
  const progressList = [];
  for (let i = 0; i < works.length; i += 100) {
    const batch = works.slice(i, i + 100).map((w) => w.id);
    if (batch.length === 0) continue;
    const { data, error } = await supabase
      .from('work_progress')
      .select('work_id, progress_date, description, payment_amount')
      .in('work_id', batch)
      .order('progress_date', { ascending: true });
    if (error) throw error;
    progressList.push(...(data || []));
  }

  // 3. 關聯會勘階段：先撈工作關聯的案件，再撈案件下的會勘（取 stage）
  const inspectionByWork = {}; // work_id -> 「初勘(10/01)、複勘(10/15)」
  for (let i = 0; i < works.length; i += 100) {
    const batch = works.slice(i, i + 100).map((w) => w.id);
    if (batch.length === 0) continue;
    const { data: caseRows, error: caseError } = await supabase
      .from('cases')
      .select('id, work_id')
      .in('work_id', batch);
    if (caseError) throw caseError;
    const caseIds = (caseRows || []).map((c) => c.id);
    if (caseIds.length === 0) continue;
    const { data: inspRows, error: inspError } = await supabase
      .from('inspections')
      .select('case_id, stage, inspection_date')
      .in('case_id', caseIds)
      .order('inspection_date', { ascending: true });
    if (inspError) throw inspError;
    const caseToWork = {};
    (caseRows || []).forEach((c) => {
      caseToWork[c.id] = c.work_id;
    });
    (inspRows || []).forEach((insp) => {
      const wid = caseToWork[insp.case_id];
      if (!wid) return;
      const label = insp.stage
        ? `${insp.stage}(${(insp.inspection_date || '').slice(5).replace('-', '/')})`
        : `會勘(${(insp.inspection_date || '').slice(5).replace('-', '/')})`;
      inspectionByWork[wid] = inspectionByWork[wid]
        ? `${inspectionByWork[wid]}、${label}`
        : label;
    });
  }

  return { works, progressList, inspectionByWork };
}

// -----------------------------------------------------
// 共用資料整理
// -----------------------------------------------------

function summarize(works, progressList, inspectionByWork) {
  const progressByWork = {};
  progressList.forEach((p) => {
    if (!progressByWork[p.work_id]) progressByWork[p.work_id] = [];
    progressByWork[p.work_id].push(p);
  });

  const rows = works.map((w) => {
    const progresses = progressByWork[w.id] || [];
    const paid = progresses.reduce((sum, p) => sum + (Number(p.payment_amount) || 0), 0);
    const totalAmount = w.total_amount != null ? Number(w.total_amount) : null;
    return {
      ...w,
      progressCount: progresses.length,
      paid,
      unpaid: totalAmount != null ? totalAmount - paid : null,
      progresses,
      inspectionSummary: inspectionByWork[w.id] || '',
    };
  });
  return rows;
}

function buildFilterText(filters) {
  const parts = [];
  if (filters.dateFrom) parts.push(`開始日期 ${filters.dateFrom} 起`);
  if (filters.dateTo) parts.push(`開始日期至 ${filters.dateTo}`);
  if (filters.category) parts.push(`分類：${filters.category}`);
  if (filters.status) parts.push(`狀態：${WORK_STATUS_MAP[filters.status] || filters.status}`);
  if (filters.q) parts.push(`關鍵字：「${filters.q}」`);
  return parts.length > 0 ? parts.join('、') : '全部工作紀錄';
}

function fileTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

// -----------------------------------------------------
// Excel 匯出
// -----------------------------------------------------

export async function exportWorksExcel(filters, keyword) {
  const { works, progressList, inspectionByWork } = await fetchWorksForExport(filters, keyword);
  if (works.length === 0) throw new Error('無符合條件的資料');

  const rows = summarize(works, progressList, inspectionByWork);
  const XLSX = await import('xlsx');

  // 工作總表
  const mainRows = rows.map((w) => ({
    工作名稱: w.title || '',
    分類: w.category || '',
    開始日期: w.start_date || '',
    結束日期: w.end_date || '',
    地點: w.location || '',
    狀態: WORK_STATUS_MAP[w.status] || w.status || '',
    總金額: w.total_amount != null ? Number(w.total_amount) : '',
    已支出: w.paid || 0,
    未支出: w.unpaid != null ? w.unpaid : '',
    進度筆數: w.progressCount,
    執行單位人員: w.executor || '',
    會勘紀錄: w.inspectionSummary,
    說明備註: w.description || '',
  }));
  const wsMain = XLSX.utils.json_to_sheet(mainRows, {
    header: [
      '工作名稱', '分類', '開始日期', '結束日期', '地點', '狀態',
      '總金額', '已支出', '未支出', '進度筆數', '執行單位人員', '會勘紀錄', '說明備註',
    ],
  });
  wsMain['!cols'] = [
    { wch: 24 }, { wch: 10 }, { wch: 11 }, { wch: 11 }, { wch: 16 }, { wch: 8 },
    { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 9 }, { wch: 14 }, { wch: 24 }, { wch: 32 },
  ];

  // 進度明細
  const progressRows = [];
  rows.forEach((w) => {
    (w.progresses || []).forEach((p) => {
      progressRows.push({
        工作名稱: w.title || '',
        進度日期: p.progress_date || '',
        進度說明: p.description || '',
        本次付款金額: Number(p.payment_amount) || 0,
      });
    });
  });
  const wsProgress = XLSX.utils.json_to_sheet(
    progressRows.length > 0
      ? progressRows
      : [{ 工作名稱: '', 進度日期: '', 進度說明: '尚無進度紀錄', 本次付款金額: '' }],
    { header: ['工作名稱', '進度日期', '進度說明', '本次付款金額'] }
  );
  wsProgress['!cols'] = [{ wch: 24 }, { wch: 11 }, { wch: 48 }, { wch: 13 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsMain, '工作總表');
  XLSX.utils.book_append_sheet(wb, wsProgress, '進度明細');
  XLSX.writeFile(wb, `工作紀錄_${fileTimestamp()}.xlsx`);
}

// -----------------------------------------------------
// PDF 匯出（html2canvas + jsPDF，中文完整顯示）
// -----------------------------------------------------

const INK = '#1f2937';
const MUTED = '#6b7280';
const BORDER = '#e5e7eb';

function el(tag, style, text) {
  const node = document.createElement(tag);
  Object.assign(node.style, style);
  if (text != null) node.textContent = text;
  return node;
}

function buildReportDom(rows, filterText) {
  const wrap = el(
    'div',
    {
      position: 'fixed',
      left: '-10000px',
      top: '0',
      width: '794px',
      backgroundColor: '#ffffff',
      fontFamily: "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif",
      color: INK,
      padding: '32px 36px',
      boxSizing: 'border-box',
    }
  );

  // 標題區
  const title = el('div', { fontSize: '22px', fontWeight: '700', marginBottom: '6px' }, '工作紀錄報表');
  const meta = el(
    'div',
    { fontSize: '11px', color: MUTED, marginBottom: '18px' },
    `篩選條件：${filterText}　｜　共 ${rows.length} 筆　｜　匯出時間：${new Date().toLocaleString('zh-TW')}`
  );
  wrap.append(title, meta);

  // 每筆工作一個區塊
  rows.forEach((w, idx) => {
    const block = el('div', {
      border: `1px solid ${BORDER}`,
      borderRadius: '10px',
      padding: '14px 16px',
      marginBottom: '12px',
      pageBreakInside: 'avoid',
    });

    // 工作名稱 + 狀態
    const head = el('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' });
    const name = el('span', { fontSize: '15px', fontWeight: '700' }, `${idx + 1}. ${w.title}`);
    const status = el(
      'span',
      {
        fontSize: '11px',
        fontWeight: '600',
        color: w.status === 'completed' ? '#047857' : '#b45309',
        backgroundColor: w.status === 'completed' ? '#ecfdf5' : '#fffbeb',
        border: `1px solid ${w.status === 'completed' ? '#a7f3d0' : '#fde68a'}`,
        borderRadius: '999px',
        padding: '2px 10px',
        whiteSpace: 'nowrap',
      },
      WORK_STATUS_MAP[w.status] || w.status
    );
    head.append(name, status);

    // 資訊列
    const info = el('div', { display: 'flex', flexWrap: 'wrap', gap: '4px 18px', fontSize: '11px', color: MUTED, marginBottom: w.progresses.length > 0 ? '10px' : '0' });
    const dateRange = w.start_date
      ? `${formatDate(w.start_date)}${w.end_date ? ` ~ ${formatDate(w.end_date)}` : ' 至今'}`
      : '';
    if (dateRange) info.append(el('span', {}, `期間：${dateRange}`));
    if (w.category) info.append(el('span', {}, `分類：${w.category}`));
    if (w.location) info.append(el('span', {}, `地點：${w.location}`));
    if (w.executor) info.append(el('span', {}, `執行：${w.executor}`));
    if (w.total_amount != null)
      info.append(el('span', { color: '#6d28d9', fontWeight: '600' }, `總金額：${formatCurrency(Number(w.total_amount))}`));
    if (w.paid > 0) info.append(el('span', { color: '#047857', fontWeight: '600' }, `已支出：${formatCurrency(w.paid)}`));
    if (w.unpaid != null && w.total_amount != null)
      info.append(el('span', { color: '#b45309', fontWeight: '600' }, `未支出：${formatCurrency(w.unpaid)}`));
    if (w.inspectionSummary) info.append(el('span', { color: '#0f766e' }, `會勘：${w.inspectionSummary}`));

    block.append(head, info);

    // 進度摘要
    if (w.progresses.length > 0) {
      const list = el('div', { borderLeft: '3px solid #ddd6fe', paddingLeft: '10px' });
      w.progresses.forEach((p) => {
        const line = el('div', { fontSize: '11px', lineHeight: '1.7', display: 'flex', gap: '8px' });
        const d = el('span', { color: MUTED, whiteSpace: 'nowrap' }, formatDate(p.progress_date));
        const desc = el('span', { flex: '1' }, p.description || '（無說明）');
        line.append(d, desc);
        if (Number(p.payment_amount) > 0) {
          line.append(
            el('span', { color: '#047857', fontWeight: '600', whiteSpace: 'nowrap' }, `付款 ${formatCurrency(Number(p.payment_amount))}`)
          );
        }
        list.append(line);
      });
      block.append(list);
    }

    // 說明
    if (w.description) {
      block.append(el('div', { fontSize: '11px', color: MUTED, marginTop: '8px', lineHeight: '1.6' }, `說明：${w.description}`));
    }

    wrap.append(block);
  });

  return wrap;
}

export async function exportWorksPdf(filters, keyword) {
  const { works, progressList, inspectionByWork } = await fetchWorksForExport(filters, keyword);
  if (works.length === 0) throw new Error('無符合條件的資料');

  const rows = summarize(works, progressList, inspectionByWork);
  const filterText = buildFilterText({ ...filters, q: keyword });

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);

  const dom = buildReportDom(rows, filterText);
  document.body.appendChild(dom);
  try {
    const canvas = await html2canvas(dom, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgData = canvas.toDataURL('image/png');
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
    heightLeft -= pdfHeight;
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;
    }
    pdf.save(`工作紀錄_${fileTimestamp()}.pdf`);
  } finally {
    document.body.removeChild(dom);
  }
}
