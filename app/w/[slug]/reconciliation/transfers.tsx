'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useListNavigation } from '@/components/pagination';
import { Badge, Button, ErrorNotice, Field, Pending, secondaryAction } from '@/components/ui';
import { useWorkspace, useWorkspaceKey } from '@/components/workspace-shell';
import { accountLabel, api, ApiError, listTransferCandidates, type InternalTransfer, type StatementDetail, type StatementLine } from '@/lib/api/client';
import { formatDate, formatMoney } from '@/lib/format';
import { useCommandKey } from '@/lib/use-command-key';

type Action = { kind: 'pair'; line: StatementLine } | { kind: 'reverse'; transfer: InternalTransfer };

export function Transfers({ entry }: { entry: StatementDetail }) {
  const workspace = useWorkspace();
  const client = useQueryClient();
  const scope = useWorkspaceKey('reconciliation');
  const { href } = useListNavigation();
  const command = useCommandKey();
  const [expanded, setExpanded] = useState(false);
  const [cursor, setCursor] = useState<{ after?: string; before?: string }>({});
  const [action, setAction] = useState<Action | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const writable = workspace.role !== 'VIEWER';
  const filters = new URLSearchParams({ ...cursor });
  const candidates = useQuery({
    queryKey: [...scope, entry.id, 'transfer-candidates', filters.toString()],
    queryFn: ({ signal }) => listTransferCandidates(workspace.id, entry.id, filters, signal),
    enabled: writable && expanded && entry.status === 'UNMATCHED',
  });
  useEffect(() => {
    if (action && !dialog.current?.open) dialog.current?.showModal();
  }, [action]);
  const save = useMutation({
    mutationFn: (reason: string) => {
      if (!action) throw new Error('No transfer action selected');
      const path = `/workspaces/${workspace.id}/transfers`;
      if (action.kind === 'reverse') {
        const body = { reason, version: action.transfer.version };
        return api<InternalTransfer>(`${path}/${action.transfer.id}/reverse`, {
          method: 'POST', body, key: command.for({ id: action.transfer.id, ...body }),
        });
      }
      const [debit, credit] = entry.amountKobo.startsWith('-') ? [entry, action.line] : [action.line, entry];
      const body = { debitEntryId: debit.id, creditEntryId: credit.id };
      return api<InternalTransfer>(path, { method: 'POST', body, key: command.for(body) });
    },
    onSuccess: async () => {
      dialog.current?.close();
      command.reset();
      setExpanded(false);
      setCursor({});
      await client.invalidateQueries({ queryKey: scope });
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 409) await client.invalidateQueries({ queryKey: scope });
    },
  });
  function open(next: Action) {
    save.reset();
    command.reset();
    setAction(next);
  }

  if (!entry.transfers.length && (!writable || entry.status !== 'UNMATCHED')) return null;
  return <section className="space-y-3 border-t border-divider pt-4" aria-labelledby="transfer-heading">
    <h3 id="transfer-heading" className="font-semibold">Internal transfers</h3>
    {writable && entry.status === 'UNMATCHED' && <>
      <Button secondary aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>Pair internal transfer</Button>
      {expanded && <div className="space-y-3">
        <p className="text-label text-muted">Choose an equal, opposite movement in another account booked within three days.</p>
        {candidates.isPending && <Pending>Looking for the other leg…</Pending>}
        <ErrorNotice error={candidates.error} retry={() => void candidates.refetch()} />
        {candidates.data?.items.length === 0 && <p className="text-muted">No eligible lines are available.</p>}
        <ul className="divide-y divide-divider">{candidates.data?.items.map((line) => <li key={line.id} className="space-y-2 py-2">
          <p className="break-words font-medium">{line.description}</p>
          <p className="break-words text-label text-muted">{accountLabel(line.account)} · {formatDate(line.date)} · {formatMoney(line.amountKobo)}</p>
          <Button secondary onClick={() => open({ kind: 'pair', line })}>Review transfer pair</Button>
        </li>)}</ul>
        {candidates.data && <div className="flex flex-wrap gap-2">
          {candidates.data.previousCursor && <Button secondary onClick={() => setCursor({ before: candidates.data!.previousCursor! })}>Previous lines</Button>}
          {candidates.data.nextCursor && <Button secondary onClick={() => setCursor({ after: candidates.data!.nextCursor! })}>More lines</Button>}
        </div>}
      </div>}
    </>}
    {!!entry.transfers.length && <ul className="divide-y divide-divider">{entry.transfers.map((transfer) => (
      <li key={transfer.id} className="space-y-2 py-2">
        <Badge tone={transfer.reversedAt ? 'warning' : 'info'}>{transfer.reversedAt ? 'Transfer reversed' : 'Paired transfer'}</Badge>
        {transfer.reversalReason && <p className="break-words text-label">Reversal reason {transfer.reversalReason}</p>}
        <div className="flex flex-wrap gap-2">
          <Link className={secondaryAction} href={href({
            entry: entry.id === transfer.debitEntryId ? transfer.creditEntryId : transfer.debitEntryId, candidateSearch: null,
          })}>View paired line</Link>
          {writable && !transfer.reversedAt && <Button secondary onClick={() => open({ kind: 'reverse', transfer })}>Reverse transfer</Button>}
        </div>
      </li>
    ))}</ul>}
    <dialog ref={dialog} onClose={() => setAction(null)} aria-labelledby="transfer-action" className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-[420px] rounded-[var(--radius-panel)] border border-divider bg-surface p-6 text-ink shadow-[var(--shadow-overlay)] backdrop:bg-slate-950/35">
      {action && <form className="space-y-4" onSubmit={(event) => {
        event.preventDefault();
        save.mutate(String(new FormData(event.currentTarget).get('reason') ?? ''));
      }}>
        <h2 id="transfer-action" className="text-section font-semibold">{action.kind === 'pair' ? 'Confirm internal transfer' : 'Reverse internal transfer'}</h2>
        <p className="break-words">{entry.description} · {accountLabel(entry.account)} · {formatMoney(entry.amountKobo)}</p>
        {action.kind === 'pair' ? <>
          <p className="break-words">{action.line.description} · {accountLabel(action.line.account)} · {formatMoney(action.line.amountKobo)}</p>
          <p>Both movements stay visible. They are excluded from cash flow when both accounts are selected.</p>
        </> : <>
          <p>Both lines become available for matching again.</p>
          <Field id="transfer-reason" name="reason" label="Reason for reversing" required maxLength={250} />
        </>}
        <ErrorNotice error={save.error} />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={save.isPending || (save.error instanceof ApiError && save.error.status === 409)}>
            {save.isPending ? 'Saving…' : action.kind === 'pair' ? 'Confirm transfer' : 'Reverse transfer'}
          </Button>
          <Button secondary onClick={() => dialog.current?.close()} disabled={save.isPending}>Cancel</Button>
        </div>
      </form>}
    </dialog>
  </section>;
}
