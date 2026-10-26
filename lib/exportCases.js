import { createClient } from '@/lib/supabaseBrowser';
import { formatDate } from '@/lib/format';
import { escapeSearchKeyword } from '@/lib/api';
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

const CASE_STATUS_MAP = { in_progress: '進行中', completed: '已結案' };

/**
 * 案件紀錄匯出（Excel / PDF）
 * 依傳入篩選條件的全部案件 + 該案件下的會勘
 */

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function buildFilterText(filters) {
  const parts = [];
  if (filters.status) parts.push(`狀態：${CASE_STATUS_MAP[filters.status] || filters.status}`);
  if (filters.q) parts.push(`關鍵字：「${filters.q}」`);
  return parts.length > 0 ? parts.join('、') : '全部案件';
}

export async function fetchCasesData(filters, keyword) {
  const supabase = createClient();
  const kw = escapeSearchKeyword(keyword);

  const cases = [];
  let from = 0;
  while (true) {
    let query = supabase.from('cases').select('*');
    if (filters.status) query = query.eq('status', filters.status);
    if (kw) {
      query = query.or(`title.ilike.%${kw}%,location.ilike.%${kw}%,description.ilike.%${kw}%`);
    }
    query = query.order('created_at', { ascending: false }).range(from, from + 999);
    const { data, error } = await query;
    if (error) throw error;
    cases.push(...(data || []));
    if (!data || data.length < 1000) break;
    from += 1000;
  }

  // 關聯工作名稱
  const workIds = [...new Set(cases.map((c) => c.work_id).filter(Boolean))];
  const workTitleById = {};
  for (const batch of chunk(workIds, 100)) {
    const { data, error } = await supabase.from('works').select('id, title').in('id', batch);
    if (error) throw error;
    (data || []).forEach((w) => {
      workTitleById[w.id] = w.title;
    });
  }

  // 會勘（依案件順序分組，日期舊到新）
  const inspections = [];
  for (const batch of chunk(cases.map((c) => c.id), 100)) {
    const { data, error } = await supabase
      .from('inspections')
      .select('*')
      .in('case_id', batch)
      .order('inspection_date', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    inspections.push(...(data || []));
  }

  const inspectionsByCase = {};
  inspections.forEach((i) => {
    if (!inspectionsByCase[i.case_id]) inspectionsByCase[i.case_id] = [];
    inspectionsByCase[i.case_id].push(i);
  });

  return { cases, inspections, inspectionsByCase, workTitleById };
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
// Excel
// -----------------------------------------------------

export async function exportCasesExcel(filters, keyword) {
  const { cases, inspections, inspectionsByCase, workTitleById } = await fetchCasesData(filters, keyword);
  if (cases.length === 0) throw new Error('無符合條件的資料');

  const XLSX = await import('xlsx');

  const caseNo = {};
  cases.forEach((c, idx) => {
    caseNo[c.id] = seqNo('C', idx);
  });

  // 會勘編號：依案件順序連續編號
  const inspectionNo = {};
  let cursor = 0;
  cases.forEach((c) => {
    (inspectionsByCase[c.id] || []).forEach((i) => {
      inspectionNo[i.id] = seqNo('I', cursor);
      cursor += 1;
    });
  });

  const wsSummary = buildExcelSummary(XLSX, '案件紀錄報表', buildFilterText({ ...filters, q: keyword }), [
    ['案件筆數', cases.length],
    ['會勘筆數', inspections.length],
  ]);

  const wsCases = XLSX.utils.json_to_sheet(
    cases.map((c) => ({
      編號: caseNo[c.id],
      案件名稱: c.title || '',
      狀態: CASE_STATUS_MAP[c.status] || c.status || '',
      地點: c.location || '',
      關聯工作: c.work_id ? workTitleById[c.work_id] || '' : '',
      會勘次數: (inspectionsByCase[c.id] || []).length,
      說明: c.description || '',
    })),
    { header: ['編號', '案件名稱', '狀態', '地點', '關聯工作', '會勘次數', '說明'] }
  );
  wsCases['!cols'] = [{ wch: 8 }, { wch: 24 }, { wch: 8 }, { wch: 16 }, { wch: 26 }, { wch: 9 }, { wch: 32 }];

  const orderedInspections = [];
  cases.forEach((c) => {
    (inspectionsByCase[c.id] || []).forEach((i) => orderedInspections.push(i));
  });

  const wsInspections = XLSX.utils.json_to_sheet(
    orderedInspections.map((i) => ({
      案件編號: caseNo[i.case_id] || '',
      案件名稱: cases.find((c) => c.id === i.case_id)?.title || '',
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
  XLSX.utils.book_append_sheet(wb, wsCases, '案件總表');
  XLSX.utils.book_append_sheet(wb, wsInspections, '會勘明細');
  XLSX.writeFile(wb, `案件紀錄_${fileTimestamp()}.xlsx`);
}

// -----------------------------------------------------
// PDF
// -----------------------------------------------------

export async function exportCasesPdf(filters, keyword) {
  const { cases, inspections, inspectionsByCase, workTitleById } = await fetchCasesData(filters, keyword);
  if (cases.length === 0) throw new Error('無符合條件的資料');

  const filterText = buildFilterText({ ...filters, q: keyword });
  const dom = pdfShell(
    '案件紀錄報表',
    `篩選條件：${filterText}　｜　案件 ${cases.length} 筆、會勘共 ${inspections.length} 筆　｜　匯出時間：${new Date().toLocaleString('zh-TW')}`
  );

  let cursor = 0;
  cases.forEach((c, idx) => {
    const caseInspections = inspectionsByCase[c.id] || [];
    const block = pdfBlock();

    const head = el('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' });
    head.append(el('span', { fontSize: '15px', fontWeight: '700' }, `${seqNo('C', idx)}　${c.title}`));
    head.append(pdfBadge(CASE_STATUS_MAP[c.status] || c.status, c.status === 'completed' ? 'green' : 'amber'));
    block.append(head);

    const info = el('div', {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '4px 18px',
      fontSize: '11px',
      color: MUTED,
      marginBottom: caseInspections.length > 0 ? '8px' : '0',
    });
    if (c.location) info.append(el('span', {}, `地點：${c.location}`));
    if (c.work_id) info.append(el('span', { color: '#6d28d9', fontWeight: '600' }, `關聯工作：${workTitleById[c.work_id] || ''}`));
    info.append(el('span', { color: '#0f766e', fontWeight: '600' }, `會勘 ${caseInspections.length} 次`));
    block.append(info);

    if (c.description) {
      block.append(el('div', { fontSize: '11px', color: MUTED, marginBottom: '6px', lineHeight: '1.6' }, `說明：${c.description}`));
    }

    if (caseInspections.length > 0) {
      block.append(pdfSubLabel('會勘紀錄', '#0f766e'));
      caseInspections.forEach((insp) => {
        cursor += 1;
        const line = el('div', { fontSize: '11px', lineHeight: '1.7', marginBottom: '2px' });
        line.append(
          el(
            'span',
            { color: '#0f766e', fontWeight: '600', whiteSpace: 'nowrap' },
            `${seqNo('I', cursor - 1)}　${insp.stage || '會勘'}　${formatDate(insp.inspection_date)}`
          )
        );
        const extras = [insp.location, insp.participants].filter(Boolean);
        if (extras.length > 0) line.append(el('span', { color: MUTED }, `　${extras.join(' · ')}`));
        block.append(line);
        if (insp.description) {
          block.append(el('div', { fontSize: '11px', marginLeft: '12px', color: INK, lineHeight: '1.6' }, `現場狀況：${insp.description}`));
        }
        if (insp.conclusion) {
          block.append(el('div', { fontSize: '11px', marginLeft: '12px', color: '#0f766e', lineHeight: '1.6' }, `結論：${insp.conclusion}`));
        }
      });
    }

    dom.append(block);
  });

  await saveDomToPdf(dom, `案件紀錄_${fileTimestamp()}.pdf`);
}
