'use client';

import React from 'react';
import { Button } from '../../components/ui/button';

interface DoodleButtonProps
  extends Omit<React.ComponentProps<typeof Button>, 'variant' | 'size'> {
  variant?: 'primary' | 'secondary' | 'success';
  size?: 'sm' | 'default' | 'lg' | 'xl';
  children: React.ReactNode;
}

/**
 * Booth button. Same API as before (variant primary | secondary, style,
 * className, disabled, aria-*), now built on the shadcn Button with a
 * framer-motion press effect. Inline `style` (font size / padding / width)
 * set by the pages is still honoured.
 */
export function DoodleButton({ variant = 'primary', size = 'lg', children, ...rest }: DoodleButtonProps) {
  const map = { primary: 'default', secondary: 'secondary', success: 'success' } as const;
  return (
    <Button 
      variant={map[variant] as any} 
      size={size as any} 
      {...rest}
    >
      {children}
    </Button>
  );
}
