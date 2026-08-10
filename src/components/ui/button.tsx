import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'danger';

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-neutral-300',
  secondary: 'bg-white text-neutral-800 border border-neutral-300 hover:bg-neutral-50',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-neutral-300',
};

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed',
        VARIANT_CLASSES[variant],
        className
      )}
      {...props}
    />
  );
}
