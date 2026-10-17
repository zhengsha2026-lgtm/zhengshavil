// 固定分類與選項（之後可改為資料表設定）

export const PROPERTY_CATEGORIES = ['辦公設備', '交通工具', '清潔工具', '家具', '其他'];

export const WORK_CATEGORIES = ['道路修補', '水溝清理', '環境清潔', '路燈維護', '小型工程', '其他'];

export const PROPERTY_STATUS_OPTIONS = [
  { value: 'in_use', label: '使用中' },
  { value: 'scrapped', label: '已報廢' },
  { value: 'lost', label: '已遺失' },
];

export const WORK_STATUS_OPTIONS = [
  { value: 'in_progress', label: '進行中' },
  { value: 'completed', label: '已完成' },
];

export const ACQUIRED_METHOD_OPTIONS = [
  { value: 'handover', label: '移交' },
  { value: 'purchase', label: '採購' },
];

export const WORK_CAPTION_PRESETS = ['施工前', '施工中', '施工後'];

export const PAGE_SIZE = 20;

export function labelOf(options, value) {
  const found = options.find((o) => o.value === value);
  return found ? found.label : value || '-';
}
