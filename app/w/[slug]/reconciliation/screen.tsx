'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Pagination, useListNavigation } from '@/components/pagination';
import { Badge, Button, ErrorNotice, Field, fieldStyle, panelStyle, Pending, secondaryAction } from '@/components/ui';
import { useWorkspace, useWorkspaceKey } from '@/components/workspace-shell';
import { accountLabel, api, ApiError, getCandidates, getStatement, listAccounts, listStatements, type Candidate, type StatementDetail, type StatementLine } from '@/lib/api/client';
import { formatDate, formatMoney } from '@/lib/format';
import { useCommandKey } from '@/lib/use-command-key';

const states: Record<StatementLine['status'], string> = { UNMATCHED: 'Unmatched', MATCHED: 'Matched' };
const kinds = { INVOICE: 'Open invoices', SETTLEMENT: 'Recorded receipts', EXPENSE: 'Recorded expenses' } as const;
const kindLabels = { INVOICE: 'Invoice', SETTLEMENT: 'Receipt', EXPENSE: 'Expense' } as const;
const reasons = { REFERENCE: 'Exact reference and amount', AMOUNT_DATE: 'Exact amount and date window', SEARCH: 'Eligible search result' };

function Status({ state }: { state: StatementLine['status'] }) {
  return <Badge tone={state === 'MATCHED' ? 'success' : 'neutral'}>{states[state]}</Badge>;
}

export function Reconciliation() {
  const workspace = useWorkspace();
  const router = useRouter();
  const { href, parameters } = useListNavigation();
  const selected = parameters.get('entry');
  const active = useRef<string | null>(null);
  useEffect(() => {
    if (selected) active.current = selected;
    else if (active.current) {
      const prefix = window.matchMedia('(min-width: 1024px)').matches ? 'desktop-line' : 'line';
      const destination = document.getElementById(`${prefix}-${active.current}`) ?? document.getElementById('statement-lines');
      destination?.focus();
      active.current = null;
    }
  }, [selected]);
  const scope = useWorkspaceKey('reconciliation');
  const accountKey = useWorkspaceKey('accounts');
  const sort = parameters.get('sort') === 'asc' ? 'asc' : 'desc';
  const filters = new URLSearchParams({ sort });
  for (const name of ['q', 'status', 'accountId', 'start', 'end', 'after', 'before']) {
    const value = parameters.get(name);
    if (value) filters.set(name, value);
  }
  const accounts = useQuery({
    queryKey: [...accountKey, 'reconciliation'],
    queryFn: ({ signal }) => listAccounts(workspace.id, new URLSearchParams({ limit: '100' }), signal),
  });
  const lines = useQuery({ queryKey: [...scope, filters.toString()], queryFn: ({ signal }) => listStatements(workspace.id, filters, signal) });
  const detail = useQuery({
    queryKey: [...scope, 'detail', selected], queryFn: ({ signal }) => getStatement(workspace.id, selected!, signal), enabled: !!selected,
  });
  const detailHref = (id: string) => href({ entry: id, candidateSearch: null });

  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-title font-semibold">Reconciliation</h1>
      {selected && <Link className={secondaryAction} href={href({ entry: null, candidateSearch: null })}>Back to statement lines</Link>}
    </header>
    <form className={`${panelStyle} flex flex-wrap items-end gap-3 ${selected ? 'hidden min-[1200px]:flex' : ''}`}
      key={`${filters.get('q')}/${filters.get('accountId')}/${filters.get('status')}/${filters.get('start')}/${filters.get('end')}`} onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const values = Object.fromEntries(['q', 'accountId', 'status', 'start', 'end'].map((name) => [name, String(form.get(name) ?? '').trim()]));
        router.push(href({ ...values, before: null, after: null, entry: null, candidateSearch: null }));
      }}>
      <div className="space-y-1">
        <label htmlFor="recon-account" className="block text-label font-medium">Account</label>
        <select id="recon-account" name="accountId" className={fieldStyle} defaultValue={filters.get('accountId') ?? ''}>
          <option value="">All accounts</option>
          {accounts.data?.items.map((account) => <option key={account.id} value={account.id}>{accountLabel(account)}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor="recon-status" className="block text-label font-medium">Status</label>
        <select id="recon-status" name="status" className={fieldStyle} defaultValue={filters.get('status') ?? ''}>
          <option value="">All statuses</option>
          {Object.entries(states).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <Field id="recon-start" name="start" type="date" label="From" defaultValue={filters.get('start') ?? ''} />
      <Field id="recon-end" name="end" type="date" label="Through" defaultValue={filters.get('end') ?? ''} />
      <Field id="recon-search" name="q" type="search" label="Description or reference" maxLength={120} defaultValue={filters.get('q') ?? ''} />
      <Button secondary type="submit">Apply filters</Button>
      <ErrorNotice error={accounts.error} retry={() => void accounts.refetch()} />
    </form>
    <div className={`grid gap-4 ${selected ? 'min-[1200px]:grid-cols-12' : ''}`}>
      <section aria-label="Statement lines" className={`${panelStyle} min-w-0 space-y-4 ${selected ? 'hidden min-[1200px]:col-span-7 min-[1200px]:block' : ''}`}>
        <h2 id="statement-lines" tabIndex={-1} className="text-section font-semibold">Statement lines</h2>
        {lines.isPending && <Pending>Loading statement lines…</Pending>}
        <ErrorNotice error={lines.error} retry={() => void lines.refetch()} />
        {lines.data?.items.length === 0 && <p className="text-muted">{filters.size > 1 ? 'No statement lines match these filters.' : 'No statement lines have been published yet.'}</p>}
        {!!lines.data?.items.length && <>
          <table className="hidden w-full table-fixed text-left text-label lg:table">
            <thead className="border-b border-divider"><tr>
              <th className="w-24" scope="col" aria-sort={sort === 'asc' ? 'ascending' : 'descending'}>
                <Link href={href({ sort: sort === 'asc' ? 'desc' : 'asc', before: null, after: null })} className="inline-flex min-h-11 items-center underline">
                  Date<span className="sr-only"> change sort direction</span>
                </Link>
              </th><th scope="col">Description</th><th scope="col" className="w-28 text-right">Amount</th><th scope="col" className="w-24 pl-2">Status</th>
            </tr></thead>
            <tbody className="divide-y divide-divider">
              {lines.data.items.map((row) => <tr key={row.id} className={selected === row.id ? 'bg-[var(--info-bg)]' : ''}>
                <td className="pr-2">{formatDate(row.date)}</td>
                <td className="break-words py-2 pr-2">
                  <Link id={`desktop-line-${row.id}`} href={detailHref(row.id)} className="flex min-h-11 items-center font-medium text-action underline">{row.description}</Link>
                  <p className="text-meta text-muted">{accountLabel(row.account)}</p>
                </td>
                <td className="text-right tabular-nums">{formatMoney(row.amountKobo)}</td><td className="pl-2"><Status state={row.status} /></td>
              </tr>)}
            </tbody>
          </table>
          <ul className="divide-y divide-divider lg:hidden">
            {lines.data.items.map((row) => <li key={row.id} className="space-y-2 py-3">
              <div className="flex flex-wrap justify-between gap-2">
                <Link id={`line-${row.id}`} href={detailHref(row.id)} className="inline-flex min-h-11 items-center break-words font-medium text-action underline">{row.description}</Link>
                <p className="tabular-nums">{formatMoney(row.amountKobo)}</p>
              </div>
              <Status state={row.status} /><p className="break-words text-label text-muted">{formatDate(row.date)} · {accountLabel(row.account)}</p>
            </li>)}
          </ul>
          <Pagination nextCursor={lines.data.nextCursor} previousCursor={lines.data.previousCursor} />
        </>}
      </section>
      {selected && <section className={`${panelStyle} min-w-0 space-y-4 min-[1200px]:col-span-5`} aria-label="Selected statement line">
        {detail.isPending && <Pending>Loading selected line…</Pending>}
        <ErrorNotice error={detail.error} retry={() => void detail.refetch()} />
        {detail.data && <Detail key={selected} entry={detail.data} />}
      </section>}
    </div>
  </div>;
}

type MatchAction = { kind: 'confirm'; candidate: Candidate } | { kind: 'reverse'; match: StatementDetail['history'][number] };
function Detail({ entry }: { entry: StatementDetail }) {
  const workspace = useWorkspace();
  const router = useRouter();
  const client = useQueryClient();
  const { href, parameters } = useListNavigation();
  const scope = useWorkspaceKey('reconciliation');
  const invoiceKey = useWorkspaceKey('invoices');
  const expenseKey = useWorkspaceKey('expenses');
  const command = useCommandKey();
  const dialog = useRef<HTMLDialogElement>(null);
  const [action, setAction] = useState<MatchAction | null>(null);
  const q = parameters.get('candidateSearch') ?? '';
  const writable = workspace.role !== 'VIEWER';
  const query = useQuery({
    queryKey: [...scope, entry.id, 'candidates', q],
    queryFn: ({ signal }) => getCandidates(workspace.id, entry.id, q, signal), enabled: writable && entry.status === 'UNMATCHED',
  });
  useEffect(() => {
    if (action && !dialog.current?.open) dialog.current?.showModal();
  }, [action]);
  const refresh = async () => {
    await Promise.all([scope, invoiceKey, expenseKey].map((queryKey) => client.invalidateQueries({ queryKey })));
  };
  const update = useMutation({
    mutationFn: (reason: string) => {
      if (!action) throw new Error('No match action selected');
      const root = `/workspaces/${workspace.id}/matches`;
      if (action.kind === 'confirm') {
        const body = { entryId: entry.id, targetId: action.candidate.id, targetKind: action.candidate.kind, targetVersion: action.candidate.version };
        return api(root, { method: 'POST', body, key: command.for(body) });
      }
      const body = { version: action.match.version, reason };
      return api(`${root}/${action.match.id}/reverse`, { method: 'POST', body, key: command.for({ id: action.match.id, ...body }) });
    },
    onSuccess: async () => {
      command.reset();
      dialog.current?.close();
      await refresh();
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 409) await refresh();
    },
  });
  function open(next: MatchAction) {
    update.reset();
    command.reset();
    setAction(next);
  }
  const candidates = query.data ?? [];
  return <>
    <div className="space-y-2">
      <h2 className="break-words text-section font-semibold">{entry.description}</h2>
      <p className="text-title font-semibold tabular-nums">{formatMoney(entry.amountKobo)}</p>
      <p className="break-words text-muted">{formatDate(entry.date)} · {accountLabel(entry.account)}</p>
      {entry.reference && <p className="break-all text-label">Reference {entry.reference}</p>}
      <Status state={entry.status} />
    </div>
    {writable && entry.status === 'UNMATCHED' && <div className="space-y-4 border-t border-divider pt-4">
      <h3 className="font-semibold">{q ? 'Search results' : 'Suggested matches'}</h3>
      <form key={q} className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
        event.preventDefault();
        const q = String(new FormData(event.currentTarget).get('q')).trim();
        router.push(href({ candidateSearch: q || null }));
      }}>
        <Field id="candidate-search" name="q" type="search" label="Search eligible records" defaultValue={q} maxLength={120} />
        <Button secondary type="submit">Search</Button>
        {q && <Link className={secondaryAction} href={href({ candidateSearch: null })}>Clear search</Link>}
      </form>
      {query.isPending && <Pending>Loading matches…</Pending>}
      <ErrorNotice error={query.error} retry={() => void query.refetch()} />
      {query.data?.length === 0 && <p className="text-muted">{q ? 'No eligible records match this search.' : 'No suggested matches. You can search or leave this line unmatched.'}</p>}
      {Object.entries(kinds).map(([kind, label]) => {
        const options = candidates.filter((candidate) => candidate.kind === kind);
        return options.length > 0 && <div key={kind} className="space-y-2">
          <h4 className="text-label font-semibold">{label}</h4>
          <ul className="space-y-2">{options.map((candidate) => <li key={candidate.id} className="space-y-2 rounded-[var(--radius-control)] border border-divider p-3">
            <p className="break-words font-medium">{candidate.label}</p>
            <p className="text-label text-muted">{formatMoney(candidate.amountKobo)} · {formatDate(candidate.date)}</p>
            <p className="text-label">Why suggested · {reasons[candidate.signal]}</p>
            <Button secondary onClick={() => open({ kind: 'confirm', candidate })}>Review {kindLabels[candidate.kind].toLowerCase()} match</Button>
          </li>)}</ul>
        </div>;
      })}
    </div>}
    {entry.history.length > 0 && <div className="space-y-3 border-t border-divider pt-4">
      <h3 className="font-semibold">Match history</h3>
      <ul className="divide-y divide-divider">{entry.history.map((match) => <li className="space-y-2 py-2" key={match.id}>
        <p>{match.expenseId ? 'Expense match' : 'Invoice receipt match'} · {match.reversedAt ? 'Reversed' : 'Active'}</p>
        <p className="text-label text-muted">{formatDate(match.createdAt.slice(0, 10))}</p>
        {match.reversalReason && <p className="break-words text-label">{match.reversalReason}</p>}
        {writable && !match.reversedAt && <Button secondary onClick={() => open({ kind: 'reverse', match })}>Reverse match</Button>}
      </li>)}</ul>
    </div>}
    <dialog ref={dialog} onClose={() => setAction(null)} aria-labelledby="match-action" className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-[420px] rounded-[var(--radius-panel)] border border-divider bg-surface p-6 text-ink shadow-[var(--shadow-overlay)] backdrop:bg-slate-950/35">
      {action && <form className="space-y-4" onSubmit={(event) => {
        event.preventDefault();
        update.mutate(String(new FormData(event.currentTarget).get('reason') ?? ''));
      }}>
        <h2 id="match-action" className="text-section font-semibold">{action.kind === 'confirm' ? 'Confirm match' : 'Reverse match'}</h2>
        <p className="break-words">{entry.description} · {formatMoney(entry.amountKobo)}</p>
        {action.kind === 'confirm' ? <>
          <p className="break-words">{kindLabels[action.candidate.kind]} · {action.candidate.label}</p>
          {action.candidate.resultingBalanceKobo !== null && <p>Outstanding after matching {formatMoney(action.candidate.resultingBalanceKobo)}.</p>}
        </> : <Field id="match-reason" name="reason" label="Reason for reversing" required maxLength={250} />}
        <ErrorNotice error={update.error} />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={update.isPending || (update.error instanceof ApiError && update.error.status === 409)}>
            {update.isPending ? 'Saving…' : action.kind === 'confirm' ? 'Confirm match' : 'Reverse match'}
          </Button>
          <Button secondary onClick={() => dialog.current?.close()} disabled={update.isPending}>Cancel</Button>
        </div>
      </form>}
    </dialog>
  </>;
}
