'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useListNavigation } from '@/components/pagination';
import { Button, ErrorNotice, Field, panelStyle, Pending, primaryAction, secondaryAction } from '@/components/ui';
import { useWorkspace, useWorkspaceKey } from '@/components/workspace-shell';
import { accountLabel, getCashFlow, getReceivables, listAccounts, type CashFlow, type Receivables } from '@/lib/api/client';
import { formatDate, formatMoney, formatTime } from '@/lib/format';
import { CashChart } from './chart';

function Metric({ label, value, source }: { label: string; value: string; source: string }) {
  return <div className={`${panelStyle} space-y-2`}>
    <p className="text-label font-medium text-muted">{label}</p>
    <p className="break-all text-title font-semibold tabular-nums">{formatMoney(value)}</p>
    <p className="text-meta text-muted">{source}</p>
  </div>;
}

export function Overview() {
  const workspace = useWorkspace();
  const router = useRouter();
  const { parameters, href } = useListNavigation();
  const selection = parameters.get('accounts');
  const selected = selection?.split(',') ?? [];
  const filters = new URLSearchParams();
  for (const name of ['start', 'end', 'accounts']) {
    const value = parameters.get(name);
    if (value) filters.set(name, value);
  }
  const reportScope = useWorkspaceKey('reports');
  const accountKey = useWorkspaceKey('accounts');
  const cash = useQuery({
    queryKey: [...reportScope, 'cash-flow', filters.toString()],
    queryFn: ({ signal }) => getCashFlow(workspace.id, filters, signal),
  });
  const receivables = useQuery({
    queryKey: [...reportScope, 'receivables'], queryFn: ({ signal }) => getReceivables(workspace.id, signal),
  });
  const accounts = useQuery({
    queryKey: [...accountKey, 'report-options'],
    queryFn: ({ signal }) => listAccounts(workspace.id, new URLSearchParams({ active: 'true', limit: '100' }), signal),
  });
  const report = cash.data;
  const reconcileParams = new URLSearchParams(report ? {
    start: report.period.start, end: report.period.end, status: 'UNMATCHED',
    ...(report.accounts.length && { accounts: report.accounts.map((row) => row.id).join(',') }),
  } : {});
  const canImport = workspace.role !== 'VIEWER';

  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-title font-semibold">Overview</h1>
        <p className="mt-1 text-muted">Observed cash flow and current invoice receivables.</p>
      </div>
      {canImport && <Link className={primaryAction} href={`/w/${workspace.slug}/imports/new`}>Import statement</Link>}
    </header>
    <form key={`${filters}/${report?.period.start}`} className={`${panelStyle} space-y-4`} onSubmit={(event) => {
      event.preventDefault();
      const input = new FormData(event.currentTarget);
      router.push(href({ start: String(input.get('start') ?? ''), end: String(input.get('end') ?? ''), accounts: input.getAll('accounts').join(',') || null }));
    }}>
      <div className="flex flex-wrap items-end gap-3">
        <Field id="report-from" name="start" type="date" label="From" required defaultValue={filters.get('start') ?? report?.period.start} />
        <Field id="report-through" name="end" type="date" label="Through" required defaultValue={filters.get('end') ?? report?.period.end} />
        <Button type="submit" secondary>Apply period and accounts</Button>
        {!!filters.size && <Link href={href({ start: null, end: null, accounts: null })} className={secondaryAction}>Reset filters</Link>}
      </div>
      {!!accounts.data?.items.length && <details>
        <summary className="flex min-h-11 cursor-pointer items-center font-medium text-action">Statement accounts</summary>
        <fieldset className="space-y-1 pt-2">
          <legend className="text-label text-muted">Leave all unchecked to include all active accounts.</legend>
          <div className="flex flex-wrap gap-2">{accounts.data.items.map((account) => (
            <label className="flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-control px-3 py-2" key={account.id}>
              <input type="checkbox" name="accounts" value={account.id} defaultChecked={selected.includes(account.id)} />
              <span className="break-words">{accountLabel(account)}</span>
            </label>
          ))}</div>
        </fieldset>
      </details>}
      <ErrorNotice error={accounts.error} retry={() => void accounts.refetch()} />
    </form>
    {cash.isPending && <Pending>Loading statement cash flow…</Pending>}
    <ErrorNotice error={cash.error} retry={() => void cash.refetch()} />
    {report && <>
      <Coverage report={report} />
      <section aria-labelledby="cash-flow" className="space-y-4">
        <div>
          <h2 id="cash-flow" className="text-section font-semibold">Statement cash flow</h2>
          <p className="text-label text-muted">{formatDate(report.period.start)} to {formatDate(report.period.end)} · NGN</p>
          <p className="text-label text-muted">{report.lastImportAt ? `Last committed import ${formatTime(report.lastImportAt)}` : 'No committed import'}</p>
        </div>
        {report.status === 'NO_DATA' ? <div className={`${panelStyle} space-y-3`}>
          <p className="font-semibold">No statement data</p>
          <p className="text-muted">Import a statement and confirm its coverage to see observed cash flow for this period.</p>
        </div> : <>
          <div className="grid gap-3 min-[768px]:grid-cols-3">
            <Metric label="Cash in" value={report.totals.inflowKobo} source="Committed statements" />
            <Metric label="Cash out" value={report.totals.outflowKobo} source="Committed statements" />
            <Metric label="Net movement" value={report.totals.netKobo} source="Cash in minus cash out" />
          </div>
          <div className={panelStyle}><CashChart data={report.monthly} /></div>
          <section className={`${panelStyle} space-y-3`} aria-labelledby="statement-activity">
            <h3 id="statement-activity" className="font-semibold">Statement activity</h3>
            <p>{report.unmatchedCount} unmatched {report.unmatchedCount === 1 ? 'line' : 'lines'} in the selected period.</p>
            <Link className={secondaryAction} href={`/w/${workspace.slug}/reconciliation?${reconcileParams}`}>Review unmatched lines</Link>
          </section>
        </>}
      </section>
    </>}
    <section className="space-y-3" aria-labelledby="receivables">
      <h2 id="receivables" className="text-section font-semibold">Current receivables</h2>
      {receivables.isPending && <Pending>Loading current receivables…</Pending>}
      <ErrorNotice error={receivables.error} retry={() => void receivables.refetch()} />
      {receivables.data && <ReceivablesPanel report={receivables.data} />}
    </section>
  </div>;
}

function Coverage({ report }: { report: CashFlow }) {
  const workspace = useWorkspace();
  const gaps = report.accounts.filter((account) => account.gaps.length > 0);
  if (report.status === 'COMPLETE' || gaps.length === 0) return null;
  return <section className="space-y-2 rounded-[var(--radius-panel)] border border-divider bg-[var(--warning-bg)] p-4 text-[var(--warning-fg)]" aria-labelledby="coverage-notice">
    <h2 id="coverage-notice" className="font-semibold">Statement coverage gaps</h2>
    <p>{report.status === 'PARTIAL' ? 'Totals reflect observed movements. Some dates are uncovered.' : 'No confirmed statement coverage for the selected period.'}</p>
    <ul className="space-y-1">{gaps.map((account) => <li key={account.id}>
      <Link className="inline-flex min-h-11 items-center font-medium underline" href={`/w/${workspace.slug}/accounts?account=${account.id}`}>{accountLabel(account)}</Link>
      <span> · {account.coveredDays} of {account.totalDays} days covered</span>
      <ul className="ml-4 list-disc text-label">{account.gaps.map((gap) => <li key={gap.start}>{formatDate(gap.start)} to {formatDate(gap.end)}</li>)}</ul>
    </li>)}</ul>
  </section>;
}

function ReceivablesPanel({ report }: { report: Receivables }) {
  return <div className={`${panelStyle} space-y-4`}>
    <p className="text-label text-muted">Issued invoices and active settlements · As of {formatTime(report.asOf)}</p>
    <dl className="grid gap-4 min-[768px]:grid-cols-3">
      <div><dt className="text-label text-muted">Total open</dt><dd className="text-title font-semibold tabular-nums">{formatMoney(report.totalOpenKobo)}</dd></div>
      <div><dt className="text-label text-muted">Current</dt><dd className="font-medium tabular-nums">{formatMoney(report.currentKobo)}</dd></div>
      <div><dt className="text-label text-muted">Overdue</dt><dd className="font-medium tabular-nums">{formatMoney(report.overdueKobo)}</dd></div>
    </dl>
    <table className="w-full max-w-[640px] text-left text-label">
      <caption className="py-2 text-left font-medium">Overdue age in days</caption>
      <thead className="border-b border-divider"><tr><th scope="col" className="py-2">Days overdue</th><th scope="col" className="text-right">Amount (NGN)</th></tr></thead>
      <tbody className="divide-y divide-divider">{report.aging.map((bucket) => <tr key={bucket.label}>
        <th scope="row" className="py-2 font-medium">{bucket.label}</th><td className="text-right tabular-nums">{formatMoney(bucket.amountKobo)}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}
