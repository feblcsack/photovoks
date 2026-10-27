import React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '../../lib/utils';

interface DoodleCardProps {
  className?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

/** Paper card with a hand-drawn outline and offset shadow. */
export function DoodleCard({ className, children, style }: DoodleCardProps) {
  return (
    <Card className={cn('w-full p-4', className)} style={style}>
      {children}
    </Card>
  );
}
