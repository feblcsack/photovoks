import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Memuat"
      className={cn('inline-block size-5 animate-[spin_0.7s_linear_infinite] rounded-full border-2 border-current border-r-transparent opacity-80', className)}
    />
  );
}
