'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef } from 'react';
import { Pagination, useListNavigation } from '@/components/pagination';
import { Badge, Button, ErrorNotice, panelStyle, Pending, secondaryAction } from '@/components/ui';
import { useWorkspace, useWorkspaceKey } from '@/components/workspace-shell';
import { accountLabel, api, getEvidence, getReadiness, listEvidence, type EvidenceSummary, type Readiness } from '@/lib/api/client';
import { formatDate, formatMoney, formatTime } from '@/lib/format';
import { useCommandKey } from '@/lib/use-command-key';

const states = { QUEUED: 'Queued', READY: 'Ready', FAILED: 'Failed', EXPIRED: 'Expired' };
const checkLabels = { COMPLETE: 'Complete', NEEDS_ATTENTION: 'Needs attention', NOT_APPLICABLE: 'Not applicable' };
const backoff = (count: number) => Math.min(800 * 1.5 ** Math.min(count, 5), 6000);

export function ReadinessScreen() {
  const workspace = useWorkspace();
  const client = useQueryClient();
  const router = useRouter();
  const { href, parameters } = useListNavigation();
  const scope = useWorkspaceKey('evidence');
  const writable = workspace.role !== 'VIEWER';
  const packId = parameters.get('pack');
  const dialog = useRef<HTMLDialogElement>(null);
  const command = useCommandKey();
  const filters = new URLSearchParams();
  for (const name of ['after', 'before']) {
    const value = parameters.get(name);
    if (value) filters.set(name, value);
  }
  const readiness = useQuery({
    queryKey: [...scope, 'checklist'], queryFn: ({ signal }) => getReadiness(workspace.id, signal), enabled: writable && !packId,
  });
  const history = useQuery({
    queryKey: [...scope, 'history', filters.toString()], queryFn: ({ signal }) => listEvidence(workspace.id, filters, signal),
    enabled: writable && !packId,
    refetchInterval: (query) => query.state.data?.items.some((item) => item.state === 'QUEUED') ? backoff(query.state.dataUpdateCount) : false,
  });
  const pack = useQuery({
    queryKey: [...scope, packId], queryFn: ({ signal }) => getEvidence(workspace.id, packId!, signal), enabled: writable && !!packId,
    refetchInterval: (query) => query.state.data?.state === 'QUEUED' ? backoff(query.state.dataUpdateCount) : false,
  });
  const generate = useMutation({
    mutationFn: (confirmIncomplete: boolean) => {
      const body = { confirmIncomplete };
      return api<{ id: string }>(`/workspaces/${workspace.id}/evidence`, { method: 'POST', body, key: command.for(body) });
    },
    onSuccess: async (result) => {
      command.reset();
      dialog.current?.close();
      router.push(href({ pack: result.id }));
      await client.invalidateQueries({ queryKey: scope });
    },
  });

  if (!writable) return <div className={`${panelStyle} space-y-3`}>
    <h1 className="text-title font-semibold">Readiness</h1>
    <p>Your workspace role can view financial reports.</p>
    <Link className={secondaryAction} href={`/w/${workspace.slug}/overview`}>View reports</Link>
  </div>;
  const latest = readiness.data;
  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-title font-semibold">Readiness</h1><p className="mt-1 text-muted">Evidence preparation only</p></div>
      {packId ? <Link className={secondaryAction} href={href({ pack: null })}>Back to readiness</Link>
        : <Button disabled={!latest || generate.isPending} onClick={() => {
          if (latest?.incomplete) dialog.current?.showModal();
          else generate.mutate(false);
        }}>{generate.isPending ? 'Queueing pack…' : 'Generate pack'}</Button>}
    </header>
    {packId ? <>
      {pack.isPending && <Pending>Loading evidence pack…</Pending>}
      <ErrorNotice error={pack.error} retry={() => void pack.refetch()} />
      {pack.data && <>
        <PackStatus pack={pack.data} />
        <Checklist readiness={pack.data.evidence} historical />
        <section className={`${panelStyle} space-y-3`} aria-label="Snapshot references">
          <h2 className="text-section font-semibold">Snapshot references</h2>
          <dl className="space-y-2 text-label">
            <div><dt className="font-medium">Evidence ID</dt><dd className="break-all">{pack.data.id}</dd></div>
            <div><dt className="font-medium">Checksum</dt><dd className="break-all">{pack.data.checksum}</dd></div>
            <div><dt className="font-medium">Rules version</dt><dd>{pack.data.rulesVersion}</dd></div>
          </dl>
          {!!pack.data.evidence.sourceBatchIds.length && <details>
            <summary className="flex min-h-11 cursor-pointer items-center font-medium text-action">Committed source imports</summary>
            <ul>{pack.data.evidence.sourceBatchIds.map((id) => <li key={id}>
              <Link className="inline-flex min-h-11 items-center break-all text-label text-action underline"
                href={`/w/${workspace.slug}/imports/new?batch=${id}`}>{id}</Link>
            </li>)}</ul>
          </details>}
        </section>
      </>}
    </> : <>
      {readiness.isPending && <Pending>Checking readiness…</Pending>}
      <ErrorNotice error={readiness.error} retry={() => void readiness.refetch()} />
      <ErrorNotice error={generate.error} />
      {latest && <Checklist readiness={latest} />}
      <section className={`${panelStyle} space-y-4`} aria-labelledby="pack-history">
        <h2 id="pack-history" className="text-section font-semibold">Pack history</h2>
        <p className="text-muted">Generating again creates a fresh snapshot. Earlier packs retain their original evidence.</p>
        {history.isPending && <Pending>Loading pack history…</Pending>}
        <ErrorNotice error={history.error} retry={() => void history.refetch()} />
        {history.data?.items.length === 0 && <p>No packs have been generated yet.</p>}
        {!!history.data?.items.length && <ul className="divide-y divide-divider">{history.data.items.map((row) => <li key={row.id}
          className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="space-y-1">
            <p className="font-medium">{formatTime(row.asOf)}</p>
            <Badge tone={row.state === 'READY' ? 'success' : row.state === 'FAILED' ? 'danger' : 'info'}>{states[row.state]}</Badge>
            {row.incomplete && <span className="ml-2 text-label text-muted">Incomplete evidence</span>}
          </div>
          <Link className={secondaryAction} href={href({ pack: row.id })}>View snapshot</Link>
        </li>)}</ul>}
        {history.data && <Pagination nextCursor={history.data.nextCursor} previousCursor={history.data.previousCursor} />}
      </section>
    </>}
    <dialog ref={dialog} aria-labelledby="incomplete-pack" className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-[420px] rounded-[var(--radius-panel)] border border-divider bg-surface p-6 text-ink shadow-[var(--shadow-overlay)] backdrop:bg-slate-950/35">
      <div className="space-y-4">
        <h2 id="incomplete-pack" className="text-section font-semibold">Generate incomplete pack</h2>
        <p>The pack will include the current evidence and label any gaps.</p>
        <ErrorNotice error={generate.error} />
        <div className="flex flex-wrap gap-3">
          <Button disabled={generate.isPending} onClick={() => generate.mutate(true)}>Generate incomplete pack</Button>
          <Button secondary disabled={generate.isPending} onClick={() => dialog.current?.close()}>Cancel</Button>
        </div>
      </div>
    </dialog>
  </div>;
}

function Checklist({ readiness, historical = false }: { readiness: Readiness; historical?: boolean }) {
  const workspace = useWorkspace();
  const period = readiness.cashFlow.period;
  const target = (key: string) => key === 'accounts' ? 'accounts?new=1' : key === 'coverage' ? 'imports/new' : key === 'matching'
    ? `reconciliation?start=${period.start}&end=${period.end}&status=UNMATCHED` : null;
  return <section className={`${panelStyle} space-y-4`} aria-labelledby="readiness-checks">
    <div className="space-y-1">
      <h2 id="readiness-checks" className="text-section font-semibold">{historical ? 'Saved readiness checklist' : 'Readiness checklist'}</h2>
      <p>{formatDate(period.start)} to {formatDate(period.end)}</p>
      <p className="text-label text-muted">{readiness.completed} of {readiness.applicable} applicable checks complete</p>
    </div>
    <ul className="divide-y divide-divider">{readiness.checks.map((check) => <li key={check.key} className="space-y-1 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium">{check.label}</p>
        <Badge tone={check.state === 'COMPLETE' ? 'success' : check.state === 'NEEDS_ATTENTION' ? 'warning' : 'neutral'}>{checkLabels[check.state]}</Badge>
      </div>
      <p className="break-words text-label text-muted">{check.detail}</p>
      {check.action && target(check.key) && !historical && <Link className="inline-flex min-h-11 items-center text-action underline"
        href={`/w/${workspace.slug}/${target(check.key)}`}>{check.action}</Link>}
    </li>)}</ul>
    {!!readiness.cashFlow.accounts.length && <div className="space-y-2 border-t border-divider pt-3">
      <h3 className="font-semibold">Coverage by account</h3>
      <ul className="space-y-1 text-label">{readiness.cashFlow.accounts.map((row) => <li key={row.id}>
        <Link className="inline-flex min-h-11 items-center font-medium text-action underline" href={`/w/${workspace.slug}/accounts?account=${row.id}`}>{accountLabel(row)}</Link>
        <span> · {row.coveredDays} of {row.totalDays} days covered</span>
      </li>)}</ul>
    </div>}
    {historical && <dl className="grid gap-3 border-t border-divider pt-3 text-label min-[768px]:grid-cols-3">
      <div><dt>Observed inflow</dt><dd className="font-medium tabular-nums">{formatMoney(readiness.cashFlow.totals.inflowKobo)}</dd></div>
      <div><dt>Observed outflow</dt><dd className="font-medium tabular-nums">{formatMoney(readiness.cashFlow.totals.outflowKobo)}</dd></div>
      <div><dt>Open receivables at capture</dt><dd className="font-medium tabular-nums">{formatMoney(readiness.receivables.totalOpenKobo)}</dd></div>
    </dl>}
  </section>;
}

function PackStatus({ pack }: { pack: EvidenceSummary }) {
  const workspace = useWorkspace();
  const client = useQueryClient();
  const scope = useWorkspaceKey('evidence');
  const command = useCommandKey();
  const path = `/workspaces/${workspace.id}/evidence/${pack.id}`;
  const retry = useMutation({
    mutationFn: () => {
      const body = { version: pack.version };
      return api(`${path}/retry`, { method: 'POST', body, key: command.for(body) });
    },
    onSuccess: async () => {
      command.reset();
      await client.invalidateQueries({ queryKey: scope });
    },
  });
  return <section className={`${panelStyle} space-y-3`} aria-labelledby="pack-status">
    <h2 id="pack-status" className="text-section font-semibold">Evidence pack</h2>
    <p role="status">{states[pack.state]} · {pack.incomplete ? 'Incomplete evidence' : 'Readiness checklist complete'}</p>
    <p className="text-label text-muted">Captured {formatTime(pack.asOf)}</p>
    {pack.state === 'QUEUED' && <Pending>Rendering the PDF from this snapshot…</Pending>}
    {pack.state === 'READY' && <>
      {pack.expiresAt && <p className="text-label text-muted">Available until {formatTime(pack.expiresAt)}</p>}
      <a className={secondaryAction} href={`/api/v1${path}/download`}>Download PDF</a>
    </>}
    {pack.state === 'FAILED' && <>
      <p className="text-[var(--danger-fg)]">The PDF could not be generated. Retry from the saved snapshot.</p>
      {pack.problemCode && <p className="text-label text-muted">Reference {pack.problemCode}</p>}
      <Button onClick={() => retry.mutate()} disabled={retry.isPending}>{retry.isPending ? 'Queueing retry…' : 'Retry PDF generation'}</Button>
    </>}
    {pack.state === 'EXPIRED' && <p className="text-muted">The download has expired. Return to readiness to generate a fresh pack.</p>}
    <ErrorNotice error={retry.error} />
  </section>;
}
