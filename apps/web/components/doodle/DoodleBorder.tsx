import React from 'react';

interface DoodleBorderProps extends React.HTMLAttributes<HTMLDivElement> {
  strokeColor?: string;
  strokeWidth?: number;
  children: React.ReactNode;
}

/**
 * Hand-drawn outline around its children. Kept for API compatibility; now uses
 * uneven border radii instead of a stretched SVG, so the line weight never
 * distorts at any size.
 */
export function DoodleBorder({
  className,
  strokeColor = 'var(--color-ink)',
  strokeWidth = 2.5,
  style,
  children,
  ...rest
}: DoodleBorderProps) {
  return (
    <div
      className={className}
      style={{
        border: `${strokeWidth}px solid ${strokeColor}`,
        borderRadius: 'var(--doodle-radius)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
