'use client';

import Link from 'next/link';
import { panelStyle, primaryAction } from '@/components/ui';
import { useWorkspace } from '@/components/workspace-shell';

export default function Overview() {
  const workspace = useWorkspace();
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-title font-semibold">Overview</h1>
        {workspace.role !== 'VIEWER' && <Link className={primaryAction} href={`/w/${workspace.slug}/imports/new`}>Import statement</Link>}
      </header>
      <section className={panelStyle} aria-labelledby="statement-data">
        <h2 id="statement-data" className="text-section font-semibold">Statement activity</h2>
        <p className="mt-2 text-muted">Review the statement rows before publishing them to your workspace.</p>
      </section>
    </div>
  );
}
