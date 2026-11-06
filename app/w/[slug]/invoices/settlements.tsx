'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { useListNavigation } from '@/components/pagination';
import { Badge, Button, ErrorNotice, Field, panelStyle, Pending, secondaryAction } from '@/components/ui';
import { useWorkspace, useWorkspaceKey } from '@/components/workspace-shell';
import { api, ApiError, listSettlements, type Invoice, type Settlement, type SettlementInput } from '@/lib/api/client';
import { decimalToKobo, formatDate, formatMoney, todayInLagos } from '@/lib/format';
import { useCommandKey } from '@/lib/use-command-key';

type Action = { kind: 'record' } | { kind: 'reverse'; settlement: Settlement };

export function SettlementHistory({ invoice }: { invoice: Invoice }) {
  const workspace = useWorkspace();
  const client = useQueryClient();
  const { parameters, href } = useListNavigation();
  const scope = useWorkspaceKey('invoices');
  const command = useCommandKey();
  const dialog = useRef<HTMLDialogElement>(null);
  const [action, setAction] = useState<Action>({ kind: 'record' });
  const filters = new URLSearchParams();
  const after = parameters.get('receiptAfter');
  const before = parameters.get('receiptBefore');
  if (after) filters.set('after', after);
  if (before) filters.set('before', before);
  const history = useQuery({
    queryKey: [...scope, invoice.id, 'settlements', filters.toString()],
    queryFn: ({ signal }) => listSettlements(workspace.id, invoice.id, filters, signal),
  });
  const canWrite = workspace.role !== 'VIEWER';
  const canRecord = canWrite && invoice.outstandingKobo !== null && invoice.outstandingKobo !== '0';
  const save = useMutation({
    mutationFn: (form: FormData) => {
      const root = `/workspaces/${workspace.id}`;
      if (action.kind === 'reverse') {
        const body = { version: action.settlement.version, reason: String(form.get('reason') ?? '') };
        return api<Settlement>(`${root}/settlements/${action.settlement.id}/reverse`, {
          method: 'POST', body, key: command.for({ action, body }),
        });
      }
      const amountKobo = decimalToKobo(String(form.get('amount') ?? ''));
      if (amountKobo === null) throw new ApiError(422, 'AMOUNT_INVALID', 'Use an NGN amount with up to two decimal places.', {
        amountKobo: ['Enter an amount such as 35000.00'],
      });
      const body: SettlementInput = {
        amountKobo, receiptDate: String(form.get('receiptDate')),
        reference: String(form.get('reference') ?? '').trim() || null,
        version: invoice.version,
      };
      return api<Settlement>(`${root}/invoices/${invoice.id}/settlements`, {
        method: 'POST', body, key: command.for({ action, body }),
      });
    },
    onSuccess: async () => {
      dialog.current?.close();
      command.reset();
      await client.invalidateQueries({ queryKey: scope });
    },
  });

  function open(next: Action) {
    save.reset();
    command.reset();
    dialog.current?.querySelector('form')?.reset();
    setAction(next);
    dialog.current?.showModal();
  }

  const errors = save.error instanceof ApiError ? save.error.fields : {};
  return <section className={`${panelStyle} space-y-4 print:hidden`} aria-labelledby="settlements">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="settlements" className="text-section font-semibold">Settlements</h2>
      {canRecord && <Button onClick={() => open({ kind: 'record' })}>Record receipt</Button>}
    </div>
    <p className="text-muted">Manual receipts update the invoice balance. Statement cash flow comes from imported statements.</p>
    {history.isPending && <Pending>Loading settlements…</Pending>}
    <ErrorNotice error={history.error} retry={() => void history.refetch()} />
    {history.data?.items.length === 0 && <p className="text-muted">No settlements are recorded for this invoice.</p>}
    {!!history.data?.items.length && <ul className="divide-y divide-divider">
      {history.data.items.map((row) => <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
        <div className="space-y-1">
          <p className="font-medium tabular-nums">{formatMoney(row.amountKobo)}</p>
          <p className="text-label text-muted">{formatDate(row.receiptDate)} · {row.source === 'MANUAL' ? 'Manual receipt' : 'Statement receipt'}</p>
          {row.reference && <p className="break-all text-label">Reference {row.reference}</p>}
          {row.reversalReason && <p className="break-words text-label">Reversal reason {row.reversalReason}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={row.reversedAt ? 'warning' : 'neutral'}>{row.reversedAt ? 'Reversed' : 'Recorded'}</Badge>
          {canWrite && !row.reversedAt && row.source === 'MANUAL' &&
            <Button secondary onClick={() => open({ kind: 'reverse', settlement: row })}
              aria-label={`Reverse receipt of ${formatMoney(row.amountKobo)} on ${formatDate(row.receiptDate)}`}>Reverse</Button>}
        </div>
      </li>)}
    </ul>}
    {(history.data?.previousCursor || history.data?.nextCursor) && <nav aria-label="Settlement pagination" className="flex flex-wrap gap-2">
      {history.data.previousCursor && <Link className={secondaryAction} href={href({ receiptAfter: null, receiptBefore: history.data.previousCursor })}>Previous</Link>}
      {history.data.nextCursor && <Link className={secondaryAction} href={href({ receiptAfter: history.data.nextCursor, receiptBefore: null })}>Next</Link>}
    </nav>}
    <dialog ref={dialog} aria-labelledby="settlement-action"
      className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-[420px] rounded-[var(--radius-panel)] border border-divider bg-surface p-6 text-ink shadow-[var(--shadow-overlay)] backdrop:bg-slate-950/35">
      <form className="space-y-4" onSubmit={(event) => {
        event.preventDefault();
        if (!save.isPending) save.mutate(new FormData(event.currentTarget));
      }}>
        <h2 id="settlement-action" className="text-section font-semibold">{action.kind === 'record' ? 'Record receipt' : 'Reverse receipt'}</h2>
        {action.kind === 'record' ? <>
          <p>Outstanding on {invoice.number} is {formatMoney(invoice.outstandingKobo ?? '0')}.</p>
          <Field id="receipt-amount" name="amount" label="Amount received (NGN)" inputMode="decimal" required maxLength={15} error={errors.amountKobo?.[0]} />
          <Field id="receipt-date" name="receiptDate" label="Receipt date" type="date" required defaultValue={todayInLagos()} error={errors.receiptDate?.[0]} />
          <Field id="receipt-reference" name="reference" label="Reference (optional)" maxLength={120} error={errors.reference?.[0]} />
        </> : <>
          <p>Reverse the {formatMoney(action.settlement.amountKobo)} receipt for {invoice.number}. The amount returns to the outstanding balance.</p>
          <Field id="receipt-reason" name="reason" label="Reason for reversing" required maxLength={250} error={errors.reason?.[0]} />
        </>}
        <ErrorNotice error={save.error} fieldLinks={{ amountKobo: 'receipt-amount', receiptDate: 'receipt-date', reference: 'receipt-reference', reason: 'receipt-reason' }} />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : action.kind === 'record' ? 'Record receipt' : 'Reverse receipt'}</Button>
          <Button secondary disabled={save.isPending} onClick={() => dialog.current?.close()}>Cancel</Button>
        </div>
      </form>
    </dialog>
  </section>;
}
