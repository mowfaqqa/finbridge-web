import type { ReactNode } from 'react';
import { WorkspaceShell } from '@/components/workspace-shell';

export default async function Layout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  return <WorkspaceShell slug={(await params).slug}>{children}</WorkspaceShell>;
}
