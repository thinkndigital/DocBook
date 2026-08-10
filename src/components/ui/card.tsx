import { cn } from '@/lib/cn';

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('rounded-lg border border-neutral-200 bg-white p-6 shadow-sm', className)}>{children}</div>
  );
}
