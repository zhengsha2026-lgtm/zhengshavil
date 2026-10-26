/**
 * 匯出共用工具：檔名時間戳、PDF DOM 建構與輸出
 * PDF 採 html2canvas + jsPDF 動態載入，中文以瀏覽器字型渲染，確保完整顯示
 */

export const INK = '#1f2937';
export const MUTED = '#6b7280';
export const BORDER = '#e5e7eb';

export function fileTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function el(tag, style, text) {
  const node = document.createElement(tag);
  Object.assign(node.style, style);
  if (text != null) node.textContent = text;
  return node;
}

/** PDF 報表外框：標題 + 篩選條件／統計資訊 */
export function pdfShell(title, metaText) {
  const wrap = el('div', {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: '794px',
    backgroundColor: '#ffffff',
    fontFamily: "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif",
    color: INK,
    padding: '32px 36px',
    boxSizing: 'border-box',
  });
  wrap.append(
    el('div', { fontSize: '22px', fontWeight: '700', marginBottom: '6px' }, title),
    el('div', { fontSize: '11px', color: MUTED, marginBottom: '18px' }, metaText)
  );
  return wrap;
}

/** 卡片區塊（避免跨頁截斷） */
export function pdfBlock() {
  return el('div', {
    border: `1px solid ${BORDER}`,
    borderRadius: '10px',
    padding: '14px 16px',
    marginBottom: '12px',
    pageBreakInside: 'avoid',
  });
}

/** 狀態徽章 */
export function pdfBadge(text, tone) {
  const tones = {
    green: { color: '#047857', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0' },
    amber: { color: '#b45309', backgroundColor: '#fffbeb', border: '1px solid #fde68a' },
    gray: { color: '#6b7280', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' },
  };
  return el(
    'span',
    {
      fontSize: '11px',
      fontWeight: '600',
      borderRadius: '999px',
      padding: '2px 10px',
      whiteSpace: 'nowrap',
      ...(tones[tone] || tones.gray),
    },
    text
  );
}

/** 小標題（案件／會勘分組用） */
export function pdfSubLabel(text, color = '#6d28d9') {
  return el('div', { fontSize: '11px', fontWeight: '700', color, marginTop: '10px', marginBottom: '4px' }, text);
}

/** 將 DOM 轉為 PDF 並下載（自動分頁） */
export async function saveDomToPdf(dom, filename) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
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
    pdf.save(filename);
  } finally {
    document.body.removeChild(dom);
  }
}

/** 簡易流水號：prefix + 補零 */
export function seqNo(prefix, index) {
  return `${prefix}${String(index + 1).padStart(3, '0')}`;
}
