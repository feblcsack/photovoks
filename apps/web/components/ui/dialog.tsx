'use client';
import React from 'react';
import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** sm 420 · md 560 · lg 760 · xl 1040 · full (sheet-like on small screens) */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  className?: string;
  bodyClassName?: string;
  hideClose?: boolean;
  dark?: boolean;
}

const WIDTHS = { sm: 'max-w-[420px]', md: 'max-w-[560px]', lg: 'max-w-[760px]', xl: 'max-w-[1040px]', full: 'max-w-[min(1280px,calc(100vw-24px))]' };

export function Dialog({ open, onOpenChange, title, description, children, footer, size = 'md', className, bodyClassName, hideClose, dark }: DialogProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 animate-fade-in bg-ink/45 backdrop-blur-[2px]" />
        <D.Content
          aria-describedby={description ? undefined : undefined}
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-24px)] w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 animate-pop flex-col overflow-hidden rounded-[18px] shadow-pop focus:outline-none',
            dark ? 'bg-[#0B0F1A] text-white' : 'bg-surface',
            WIDTHS[size],
            className,
          )}
        >
          {title ? (
            <div className={cn('flex items-start justify-between gap-4 px-5 pt-5 pb-3', dark ? '' : 'border-b border-line')}>
              <div className="min-w-0">
                <D.Title className="text-base font-bold">{title}</D.Title>
                {description ? <D.Description className={cn('mt-0.5 text-[13px] leading-relaxed', dark ? 'text-white/60' : 'text-muted')}>{description}</D.Description> : null}
              </div>
              {!hideClose ? (
                <D.Close className={cn('-mt-1 -mr-1 flex size-9 shrink-0 items-center justify-center rounded-ctl', dark ? 'text-white/70 hover:bg-white/10' : 'text-muted hover:bg-ink/5')} aria-label="Tutup">
                  <X className="size-[18px]" />
                </D.Close>
              ) : null}
            </div>
          ) : (
            <D.Title className="sr-only">Dialog</D.Title>
          )}
          <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4', bodyClassName)}>{children}</div>
          {footer ? <div className={cn('flex flex-wrap items-center justify-end gap-2 px-5 py-3.5', dark ? 'border-t border-white/10' : 'border-t border-line bg-canvas/60')}>{footer}</div> : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Promise-free confirm dialog. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = 'Ya, lanjutkan', tone = 'danger', onConfirm, loading }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: React.ReactNode; confirmLabel?: string; tone?: 'danger' | 'primary'; onConfirm: () => void; loading?: boolean }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={title}
      footer={
        <>
          <button type="button" className="h-10 rounded-ctl px-4 text-sm font-semibold text-ink-2 hover:bg-ink/5" onClick={() => onOpenChange(false)}>
            Batal
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className={cn('h-10 rounded-ctl px-4 text-sm font-semibold text-white disabled:opacity-50', tone === 'danger' ? 'bg-danger hover:bg-[#A82020]' : 'bg-brand hover:bg-brand-hover')}
          >
            {loading ? 'Memproses…' : confirmLabel}
          </button>
        </>
      }
    >
      {description ? <div className="text-sm leading-relaxed text-ink-2">{description}</div> : null}
    </Dialog>
  );
}
