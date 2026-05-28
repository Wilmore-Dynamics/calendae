const AVATAR_COLORS = [
  'bg-pastel-blue text-blue-900',
  'bg-pastel-green text-green-900',
  'bg-pastel-pink text-pink-900',
  'bg-pastel-purple text-purple-900',
  'bg-pastel-yellow text-yellow-900',
  'bg-pastel-peach text-orange-900',
];

function getColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0][0] || '').toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Avatar({
  name,
  url,
  size = 'md',
}: {
  name: string;
  url?: string | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dims = { sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-12 h-12 text-base' };
  const cls = `rounded-full flex items-center justify-center font-medium shrink-0 ${dims[size]} ${getColor(name)}`;

  if (url) {
    return <img src={url} alt={name} className={`${cls} object-cover`} />;
  }

  return <span className={cls}>{initials(name)}</span>;
}
