/**
 * 全站圖示規範（lucide-react）
 *
 * 使用方式：
 *   import { StatIcon, EmptyIcon, ActionIcon } from '@/components/icons';
 *   <StatIcon icon={Package} />          // 統計卡片圖示
 *   <EmptyIcon icon={Package} />         // 空狀態圖示
 *   <ActionIcon icon={Plus} />           // 列表／按鈕小圖示（可傳 className 覆寫顏色）
 *
 * 尺寸與風格規範：
 *   | 使用情境       | 尺寸   | 顏色                 | 線寬 |
 *   |----------------|--------|----------------------|------|
 *   | 統計卡片       | 24px   | accent-600           | 1.75 |
 *   | 空狀態         | 48px   | gray-300             | 1.5  |
 *   | 列表／操作按鈕 | 18–20px| gray-500 / accent    | 1.75 |
 *   | 導覽列         | 22px   | 依狀態               | 1.75 |
 *
 * 新功能一律使用 lucide-react，遵守上表規範，保持全站風格一致。
 * 圖示庫：https://lucide.dev/icons
 */

/** 統計卡片圖示：24px、accent-600、線寬 1.75 */
export function StatIcon({ icon: Icon, className = '' }) {
  return <Icon size={24} strokeWidth={1.75} className={`text-accent-600 ${className}`} aria-hidden="true" />;
}

/** 空狀態圖示：48px、gray-300、線寬 1.5 */
export function EmptyIcon({ icon: Icon, className = '' }) {
  return <Icon size={48} strokeWidth={1.5} className={`text-gray-300 ${className}`} aria-hidden="true" />;
}

/** 列表／操作按鈕小圖示：20px、線寬 1.75（顏色預設 gray-500，可用 className 覆寫） */
export function ActionIcon({ icon: Icon, size = 20, className = '' }) {
  return <Icon size={size} strokeWidth={1.75} className={`text-gray-500 ${className}`} aria-hidden="true" />;
}

/** 導覽列圖示：22px、線寬 1.75（顏色由呼叫端以 className 控制） */
export function NavIcon({ icon: Icon, className = '' }) {
  return <Icon size={22} strokeWidth={1.75} className={className} aria-hidden="true" />;
}
