import React from 'react';
import { PortalShell } from '@/components/shell/PortalShell';

export default function AdminPortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell mode="admin">{children}</PortalShell>;
}
