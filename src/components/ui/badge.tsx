import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'success' | 'warning' | 'danger';

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-neutral-100 text-neutral-700',
  success: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-800',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', TONE_CLASSES[tone])}>
      {children}
    </span>
  );
}
