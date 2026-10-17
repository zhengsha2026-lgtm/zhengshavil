export default function StatusBadge({ type, value }) {
  const map = {
    property: {
      in_use: 'bg-emerald-50 text-emerald-700',
      scrapped: 'bg-gray-100 text-gray-500',
      lost: 'bg-red-50 text-red-600',
    },
    work: {
      in_progress: 'bg-amber-50 text-amber-700',
      completed: 'bg-emerald-50 text-emerald-700',
    },
  };
  const labels = {
    property: { in_use: '使用中', scrapped: '已報廢', lost: '已遺失' },
    work: { in_progress: '進行中', completed: '已完成' },
  };
  const cls = (map[type] && map[type][value]) || 'bg-gray-100 text-gray-500';
  const label = (labels[type] && labels[type][value]) || value || '-';
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function CategoryBadge({ children }) {
  return <span className="badge bg-accent-50 text-accent-700">{children}</span>;
}
