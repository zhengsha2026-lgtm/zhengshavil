import { createClient } from '@/lib/supabaseBrowser';
import { formatDate, formatCurrency } from '@/lib/format';
import { escapeSearchKeyword } from '@/lib/api';
import { WORK_STATUS_OPTIONS } from '@/lib/constants';
import {
  INK,
  MUTED,
  el,
  fileTimestamp,
  pdfShell,
  pdfBlock,
  pdfBadge,
  pdfSubLabel,
  saveDomToPdf,
  seqNo,
} from '@/lib/exportShared';

const WORK_STATUS_MAP = WORK_STATUS_OPTIONS.reduce((m, o) => ({ ...m, [o.value]: o.label }), {});
const CASE_STATUS_MAP = { in_progress: '進行中', completed: '已結案' };

/**
 * 工作紀錄匯出（Excel / PDF / 完整報表）
 * 依傳入篩選條件抓取「全部」符合的工作（不分頁）
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

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * 取出符合篩選的全部工作；includeRelations 時一併取出關聯案件與會勘
 */
export async function fetchWorksData(filters, keyword, includeRelations = false) {
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

  const workIds = works.map((w) => w.id);

  // 2. 進度明細
  const progressList = [];
  for (const batch of chunk(workIds, 100)) {
    if (batch.length === 0) continue;
    const { data, error } = await supabase
      .from('work_progress')
      .select('work_id, progress_date, description, payment_amount')
      .in('work_id', batch)
      .order('progress_date', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    progressList.push(...(data || []));
  }

  // 3. 關聯案件與會勘（完整報表用）
  const cases = [];
  const inspections = [];
  if (includeRelations) {
    for (const batch of chunk(workIds, 100)) {
      if (batch.length === 0) continue;
      const { data, error } = await supabase
        .from('cases')
        .select('*')
        .in('work_id', batch)
        .order('created_at', { ascending: true });
      if (error) throw error;
      cases.push(...(data || []));
    }

    for (const batch of chunk(cases.map((c) => c.id), 100)) {
      if (batch.length === 0) continue;
      const { data, error } = await supabase
        .from('inspections')
        .select('*')
        .in('case_id', batch)
        .order('inspection_date', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      inspections.push(...(data || []));
    }
  }

  return { works, progressList, cases, inspections };
}

// -----------------------------------------------------
// 共用資料整理
// -----------------------------------------------------

function summarize(works, progressList) {
  const progressByWork = {};
  progressList.forEach((p) => {
    if (!progressByWork[p.work_id]) progressByWork[p.work_id] = [];
    progressByWork[p.work_id].push(p);
  });

  return works.map((w) => {
    const progresses = progressByWork[w.id] || [];
    const paid = progresses.reduce((sum, p) => sum + (Number(p.payment_amount) || 0), 0);
    const totalAmount = w.total_amount != null ? Number(w.total_amount) : null;
    return {
      ...w,
      progressCount: progresses.length,
      paid,
      unpaid: totalAmount != null ? totalAmount - paid : null,
      progresses,
    };
  });
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

function workStatusLabel(w) {
  return WORK_STATUS_MAP[w.status] || w.status || '';
}

function workDateRange(w) {
  if (!w.start_date) return '';
  return `${formatDate(w.start_date)}${w.end_date ? ` ~ ${formatDate(w.end_date)}` : ' 至今'}`;
}

function buildWorkInfoLine(w) {
  const info = el('div', {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px 18px',
    fontSize: '11px',
    color: MUTED,
    marginBottom: '8px',
  });
  const dateRange = workDateRange(w);
  if (dateRange) info.append(el('span', {}, `期間：${dateRange}`));
  if (w.category) info.append(el('span', {}, `分類：${w.category}`));
  if (w.location) info.append(el('span', {}, `地點：${w.location}`));
  if (w.executor) info.append(el('span', {}, `執行：${w.executor}`));
  if (w.total_amount != null)
    info.append(el('span', { color: '#6d28d9', fontWeight: '600' }, `總金額：${formatCurrency(Number(w.total_amount))}`));
  if (w.paid > 0) info.append(el('span', { color: '#047857', fontWeight: '600' }, `已支出：${formatCurrency(w.paid)}`));
  if (w.unpaid != null) info.append(el('span', { color: '#b45309', fontWeight: '600' }, `未支出：${formatCurrency(w.unpaid)}`));
  return info;
}

function buildProgressList(progresses) {
  const list = el('div', { borderLeft: '3px solid #ddd6fe', paddingLeft: '10px' });
  progresses.forEach((p) => {
    const line = el('div', { fontSize: '11px', lineHeight: '1.7', display: 'flex', gap: '8px' });
    line.append(el('span', { color: MUTED, whiteSpace: 'nowrap' }, formatDate(p.progress_date)));
    line.append(el('span', { flex: '1' }, p.description || '（無說明）'));
    if (Number(p.payment_amount) > 0) {
      line.append(
        el('span', { color: '#047857', fontWeight: '600', whiteSpace: 'nowrap' }, `付款 ${formatCurrency(Number(p.payment_amount))}`)
      );
    }
    list.append(line);
  });
  return list;
}

function buildExcelSummary(XLSX, title, filterText, stats) {
  const rows = [
    ['報表名稱', title],
    ['篩選條件', filterText],
    ['匯出時間', new Date().toLocaleString('zh-TW')],
    ...stats,
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 18 }, { wch: 60 }];
  return ws;
}

// -----------------------------------------------------
// 工作紀錄：Excel
// -----------------------------------------------------

export async function exportWorksExcel(filters, keyword) {
  const { works, progressList } = await fetchWorksData(filters, keyword, false);
  if (works.length === 0) throw new Error('無符合條件的資料');

  const rows = summarize(works, progressList);
  const XLSX = await import('xlsx');

  const mainRows = rows.map((w, idx) => ({
    編號: seqNo('W', idx),
    工作名稱: w.title || '',
    分類: w.category || '',
    開始日期: w.start_date || '',
    結束日期: w.end_date || '',
    地點: w.location || '',
    狀態: workStatusLabel(w),
    總金額: w.total_amount != null ? Number(w.total_amount) : '',
    已支出: w.paid || 0,
    未支出: w.unpaid != null ? w.unpaid : '',
    進度筆數: w.progressCount,
    執行單位人員: w.executor || '',
    說明: w.description || '',
  }));
  const wsMain = XLSX.utils.json_to_sheet(mainRows, {
    header: [
      '編號', '工作名稱', '分類', '開始日期', '結束日期', '地點', '狀態',
      '總金額', '已支出', '未支出', '進度筆數', '執行單位人員', '說明',
    ],
  });
  wsMain['!cols'] = [
    { wch: 8 }, { wch: 24 }, { wch: 10 }, { wch: 11 }, { wch: 11 }, { wch: 16 }, { wch: 8 },
    { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 9 }, { wch: 14 }, { wch: 32 },
  ];

  const progressRows = [];
  rows.forEach((w, idx) => {
    w.progresses.forEach((p) => {
      progressRows.push({
        工作編號: seqNo('W', idx),
        工作名稱: w.title || '',
        進度日期: p.progress_date || '',
        進度說明: p.description || '',
        本次付款金額: Number(p.payment_amount) || 0,
      });
    });
  });
  const wsProgress = XLSX.utils.json_to_sheet(progressRows, {
    header: ['工作編號', '工作名稱', '進度日期', '進度說明', '本次付款金額'],
  });
  wsProgress['!cols'] = [{ wch: 9 }, { wch: 24 }, { wch: 11 }, { wch: 48 }, { wch: 13 }];

  const wsSummary = buildExcelSummary(XLSX, '工作紀錄報表', buildFilterText({ ...filters, q: keyword }), [
    ['工作筆數', rows.length],
    ['進度筆數', progressRows.length],
  ]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsSummary, '摘要');
  XLSX.utils.book_append_sheet(wb, wsMain, '工作總表');
  XLSX.utils.book_append_sheet(wb, wsProgress, '進度明細');
  XLSX.writeFile(wb, `工作紀錄_${fileTimestamp()}.xlsx`);
}

// -----------------------------------------------------
// 工作紀錄：PDF
// -----------------------------------------------------

export async function exportWorksPdf(filters, keyword) {
  const { works, progressList } = await fetchWorksData(filters, keyword, false);
  if (works.length === 0) throw new Error('無符合條件的資料');

  const rows = summarize(works, progressList);
  const totalProgress = rows.reduce((sum, w) => sum + w.progressCount, 0);
  const filterText = buildFilterText({ ...filters, q: keyword });

  const dom = pdfShell(
    '工作紀錄報表',
    `篩選條件：${filterText}　｜　工作 ${rows.length} 筆、進度共 ${totalProgress} 筆　｜　匯出時間：${new Date().toLocaleString('zh-TW')}`
  );

  rows.forEach((w, idx) => {
    const block = pdfBlock();
    const head = el('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' });
    head.append(el('span', { fontSize: '15px', fontWeight: '700' }, `${seqNo('W', idx)}　${w.title}`));
    head.append(pdfBadge(workStatusLabel(w), w.status === 'completed' ? 'green' : 'amber'));
    block.append(head, buildWorkInfoLine(w));

    if (w.progresses.length > 0) block.append(buildProgressList(w.progresses));

    if (w.description) {
      block.append(el('div', { fontSize: '11px', color: MUTED, marginTop: '8px', lineHeight: '1.6' }, `說明：${w.description}`));
    }
    dom.append(block);
  });

  await saveDomToPdf(dom, `工作紀錄_${fileTimestamp()}.pdf`);
}

// -----------------------------------------------------
// 完整報表：Excel（含案件／會勘）
// -----------------------------------------------------

export async function exportFullExcel(filters, keyword) {
  const { works, progressList, cases, inspections } = await fetchWorksData(filters, keyword, true);
  if (works.length === 0) throw new Error('無符合條件的資料');

  const rows = summarize(works, progressList);
  const XLSX = await import('xlsx');

  // 編號對照
  const workNo = {};
  rows.forEach((w, idx) => {
    workNo[w.id] = seqNo('W', idx);
  });
  const caseNo = {};
  cases.forEach((c, idx) => {
    caseNo[c.id] = seqNo('C', idx);
  });
  const inspectionNo = {};
  const inspectionsByCase = {};
  inspections.forEach((i) => {
    if (!inspectionsByCase[i.case_id]) inspectionsByCase[i.case_id] = [];
    inspectionsByCase[i.case_id].push(i);
  });
  let inspCursor = 0;
  cases.forEach((c) => {
    (inspectionsByCase[c.id] || []).forEach((i) => {
      inspectionNo[i.id] = seqNo('I', inspCursor);
      inspCursor += 1;
    });
  });
  const orderedInspections = [];
  cases.forEach((c) => {
    (inspectionsByCase[c.id] || []).forEach((i) => orderedInspections.push(i));
  });

  // 工作表1：摘要
  const wsSummary = buildExcelSummary(XLSX, '工作完整報表（含案件／會勘）', buildFilterText({ ...filters, q: keyword }), [
    ['工作筆數', rows.length],
    ['進度筆數', progressList.length],
    ['關聯案件筆數', cases.length],
    ['會勘筆數', inspections.length],
    ['已支出合計', rows.reduce((s, w) => s + w.paid, 0)],
  ]);

  // 工作表2：工作總表
  const wsMain = XLSX.utils.json_to_sheet(
    rows.map((w) => ({
      編號: workNo[w.id],
      工作名稱: w.title || '',
      分類: w.category || '',
      開始日期: w.start_date || '',
      結束日期: w.end_date || '',
      地點: w.location || '',
      狀態: workStatusLabel(w),
      總金額: w.total_amount != null ? Number(w.total_amount) : '',
      已支出: w.paid || 0,
      未支出: w.unpaid != null ? w.unpaid : '',
      進度筆數: w.progressCount,
      執行單位人員: w.executor || '',
      說明: w.description || '',
    })),
    {
      header: [
        '編號', '工作名稱', '分類', '開始日期', '結束日期', '地點', '狀態',
        '總金額', '已支出', '未支出', '進度筆數', '執行單位人員', '說明',
      ],
    }
  );
  wsMain['!cols'] = [
    { wch: 8 }, { wch: 24 }, { wch: 10 }, { wch: 11 }, { wch: 11 }, { wch: 16 }, { wch: 8 },
    { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 9 }, { wch: 14 }, { wch: 32 },
  ];

  // 工作表3：進度明細
  const progressRows = [];
  rows.forEach((w) => {
    w.progresses.forEach((p) => {
      progressRows.push({
        工作編號: workNo[w.id],
        工作名稱: w.title || '',
        進度日期: p.progress_date || '',
        進度說明: p.description || '',
        本次付款金額: Number(p.payment_amount) || 0,
      });
    });
  });
  const wsProgress = XLSX.utils.json_to_sheet(progressRows, {
    header: ['工作編號', '工作名稱', '進度日期', '進度說明', '本次付款金額'],
  });
  wsProgress['!cols'] = [{ wch: 9 }, { wch: 24 }, { wch: 11 }, { wch: 48 }, { wch: 13 }];

  // 工作表4：案件總表
  const wsCases = XLSX.utils.json_to_sheet(
    cases.map((c) => ({
      編號: caseNo[c.id],
      案件名稱: c.title || '',
      狀態: CASE_STATUS_MAP[c.status] || c.status || '',
      地點: c.location || '',
      關聯工作: c.work_id ? `${workNo[c.work_id] || ''} ${works.find((w) => w.id === c.work_id)?.title || ''}`.trim() : '',
      會勘次數: (inspectionsByCase[c.id] || []).length,
      說明: c.description || '',
    })),
    { header: ['編號', '案件名稱', '狀態', '地點', '關聯工作', '會勘次數', '說明'] }
  );
  wsCases['!cols'] = [{ wch: 8 }, { wch: 24 }, { wch: 8 }, { wch: 16 }, { wch: 26 }, { wch: 9 }, { wch: 32 }];

  // 工作表5：會勘明細
  const caseById = {};
  cases.forEach((c) => {
    caseById[c.id] = c;
  });
  const wsInspections = XLSX.utils.json_to_sheet(
    orderedInspections.map((i) => ({
      案件編號: caseNo[i.case_id] || '',
      案件名稱: caseById[i.case_id]?.title || '',
      會勘編號: inspectionNo[i.id],
      會勘階段: i.stage || '',
      會勘日期: i.inspection_date || '',
      地點: i.location || '',
      參與人員: i.participants || '',
      現場狀況: i.description || '',
      結論: i.conclusion || '',
    })),
    { header: ['案件編號', '案件名稱', '會勘編號', '會勘階段', '會勘日期', '地點', '參與人員', '現場狀況', '結論'] }
  );
  wsInspections['!cols'] = [
    { wch: 9 }, { wch: 24 }, { wch: 9 }, { wch: 10 }, { wch: 11 }, { wch: 16 }, { wch: 18 }, { wch: 34 }, { wch: 34 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsSummary, '摘要');
  XLSX.utils.book_append_sheet(wb, wsMain, '工作總表');
  XLSX.utils.book_append_sheet(wb, wsProgress, '進度明細');
  XLSX.utils.book_append_sheet(wb, wsCases, '案件總表');
  XLSX.utils.book_append_sheet(wb, wsInspections, '會勘明細');
  XLSX.writeFile(wb, `工作完整報表_${fileTimestamp()}.xlsx`);
}

// -----------------------------------------------------
// 完整報表：PDF（依工作分組，含案件與會勘）
// -----------------------------------------------------

export async function exportFullPdf(filters, keyword) {
  const { works, progressList, cases, inspections } = await fetchWorksData(filters, keyword, true);
  if (works.length === 0) throw new Error('無符合條件的資料');

  const rows = summarize(works, progressList);
  const totalProgress = rows.reduce((sum, w) => sum + w.progressCount, 0);
  const filterText = buildFilterText({ ...filters, q: keyword });

  const casesByWork = {};
  cases.forEach((c) => {
    if (!casesByWork[c.work_id]) casesByWork[c.work_id] = [];
    casesByWork[c.work_id].push(c);
  });
  const inspectionsByCase = {};
  inspections.forEach((i) => {
    if (!inspectionsByCase[i.case_id]) inspectionsByCase[i.case_id] = [];
    inspectionsByCase[i.case_id].push(i);
  });

  // 編號：案件依工作順序、會勘依案件順序
  const caseNo = {};
  const inspectionNo = {};
  let cCursor = 0;
  let iCursor = 0;
  rows.forEach((w) => {
    (casesByWork[w.id] || []).forEach((c) => {
      caseNo[c.id] = seqNo('C', cCursor);
      cCursor += 1;
      (inspectionsByCase[c.id] || []).forEach((insp) => {
        inspectionNo[insp.id] = seqNo('I', iCursor);
        iCursor += 1;
      });
    });
  });

  const dom = pdfShell(
    '工作完整報表（含案件／會勘）',
    `篩選條件：${filterText}　｜　工作 ${rows.length} 筆、進度 ${totalProgress} 筆、案件 ${cases.length} 筆、會勘 ${inspections.length} 筆　｜　匯出時間：${new Date().toLocaleString('zh-TW')}`
  );

  rows.forEach((w, idx) => {
    const block = pdfBlock();
    const head = el('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' });
    head.append(el('span', { fontSize: '15px', fontWeight: '700' }, `${seqNo('W', idx)}　${w.title}`));
    head.append(pdfBadge(workStatusLabel(w), w.status === 'completed' ? 'green' : 'amber'));
    block.append(head, buildWorkInfoLine(w));

    if (w.progresses.length > 0) {
      block.append(pdfSubLabel('進度紀錄', '#6d28d9'));
      block.append(buildProgressList(w.progresses));
    }

    const relatedCases = casesByWork[w.id] || [];
    if (relatedCases.length > 0) {
      block.append(pdfSubLabel('關聯案件與會勘', '#4338ca'));
      relatedCases.forEach((c) => {
        block.append(
          el(
            'div',
            { fontSize: '11.5px', fontWeight: '600', color: INK, marginTop: '4px' },
            `${caseNo[c.id]}　${c.title}（${CASE_STATUS_MAP[c.status] || c.status}）`
          )
        );
        (inspectionsByCase[c.id] || []).forEach((insp) => {
          const line = el('div', { fontSize: '11px', color: MUTED, marginLeft: '12px', lineHeight: '1.7' });
          line.append(
            el(
              'span',
              { color: '#0f766e', fontWeight: '600' },
              `${inspectionNo[insp.id]}　${insp.stage || '會勘'}　${formatDate(insp.inspection_date)}`
            )
          );
          const extras = [insp.location, insp.participants].filter(Boolean);
          if (extras.length > 0) line.append(el('span', {}, `　${extras.join(' · ')}`));
          block.append(line);
          if (insp.description) {
            block.append(el('div', { fontSize: '11px', marginLeft: '12px', lineHeight: '1.6' }, `現場狀況：${insp.description}`));
          }
          if (insp.conclusion) {
            block.append(el('div', { fontSize: '11px', marginLeft: '12px', lineHeight: '1.6', color: '#0f766e' }, `結論：${insp.conclusion}`));
          }
        });
      });
    }

    if (w.description) {
      block.append(el('div', { fontSize: '11px', color: MUTED, marginTop: '8px', lineHeight: '1.6' }, `說明：${w.description}`));
    }
    dom.append(block);
  });

  await saveDomToPdf(dom, `工作完整報表_${fileTimestamp()}.pdf`);
}
