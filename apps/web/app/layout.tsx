import type { Metadata, Viewport } from 'next';
import React from 'react';
import { fontVariables } from './fonts';
import { ToastProvider } from '@/components/ui/toast';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Photovoks', template: '%s · Photovoks' },
  description: 'Photobooth web app untuk event — booth, galeri, frame builder, AI, dan print station.',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Photovoks' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#F4EDDC',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${fontVariables} h-full antialiased`}>
      <body className="min-h-full">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
