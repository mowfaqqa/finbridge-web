'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Pagination, useListNavigation } from '@/components/pagination';
import { Button, ErrorNotice, Field, panelStyle, Pending } from '@/components/ui';
import { useWorkspace, useWorkspaceKey } from '@/components/workspace-shell';
import { listAuditEvents } from '@/lib/api/client';
import { formatTime } from '@/lib/format';

function label(action: string) {
  const name = action.replaceAll('_', ' ');
  return name.slice(0, 1).toUpperCase() + name.slice(1);
}

export function AuditHistory() {
  const workspace = useWorkspace();
  const router = useRouter();
  const { parameters, href } = useListNavigation();
  const key = useWorkspaceKey('audit');
  const filters = new URLSearchParams();
  for (const name of ['q', 'after', 'before']) {
    const value = parameters.get(name);
    if (value) filters.set(name, value);
  }
  const rows = useQuery({
    queryKey: [...key, filters.toString()], queryFn: ({ signal }) => listAuditEvents(workspace.id, filters, signal),
    enabled: workspace.role === 'OWNER',
  });
  return <div className="space-y-6">
    <h1 className="text-title font-semibold">Audit history</h1>
    {workspace.role !== 'OWNER' ? <p className={panelStyle}>Only workspace owners can view audit history.</p> :
      <section className={`${panelStyle} space-y-4`} aria-label="Workspace audit events">
        <form key={filters.get('q') ?? ''} className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
          event.preventDefault();
          const q = String(new FormData(event.currentTarget).get('q') ?? '').trim().replace(/\s+/g, '_');
          router.push(href({ q, after: null, before: null }));
        }}>
          <Field id="audit-action" name="q" type="search" label="Find by action" maxLength={120} defaultValue={filters.get('q')?.replaceAll('_', ' ') ?? ''} />
          <Button secondary type="submit">Search</Button>
        </form>
        {rows.isPending && <Pending>Loading audit events…</Pending>}
        <ErrorNotice error={rows.error} retry={() => void rows.refetch()} />
        {rows.data?.items.length === 0 && <p className="text-muted">No audit events match this view.</p>}
        {!!rows.data?.items.length && <ul className="divide-y divide-divider">
          {rows.data.items.map((event) => <li className="space-y-2 py-3" key={event.id}>
            <p className="font-semibold">{label(event.action)}</p>
            <p className="text-label text-muted">{formatTime(event.createdAt)}</p>
            {event.reason && <p className="break-words text-label">Reason {event.reason}</p>}
            <details>
              <summary className="flex min-h-11 cursor-pointer items-center text-label font-medium text-action">Event references</summary>
              <dl className="grid gap-2 text-meta sm:grid-cols-2">
                <div><dt className="font-medium">Actor</dt><dd className="break-all">{event.actorId}</dd></div>
                <div><dt className="font-medium">Record</dt><dd className="break-all">{event.resourceId}</dd></div>
                <div><dt className="font-medium">Request</dt><dd className="break-all">{event.requestId}</dd></div>
                {event.version !== null && <div><dt className="font-medium">Record version</dt><dd>{event.version}</dd></div>}
              </dl>
            </details>
          </li>)}
        </ul>}
        {rows.data && <Pagination nextCursor={rows.data.nextCursor} previousCursor={rows.data.previousCursor} />}
      </section>}
  </div>;
}
