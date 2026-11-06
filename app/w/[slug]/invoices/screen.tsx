'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Pagination, useListNavigation } from '@/components/pagination';
import { Badge, Button, ErrorNotice, Field, fieldStyle, panelStyle, Pending, primaryAction, secondaryAction } from '@/components/ui';
import { useWorkspace, useWorkspaceKey } from '@/components/workspace-shell';
import { api, getInvoice, listInvoices, type Invoice } from '@/lib/api/client';
import { formatDate, formatMoney } from '@/lib/format';
import { useCommandKey } from '@/lib/use-command-key';
import { InvoiceForm } from './form';

const statusLabels = { DRAFT: 'Draft', OPEN: 'Open', VOID: 'Void' };
function InvoiceStatus({ status, overdue }: Pick<Invoice, 'status' | 'overdue'>) {
  return <span className="inline-flex flex-wrap gap-1">
    <Badge tone={status === 'OPEN' ? 'info' : status === 'VOID' ? 'danger' : 'neutral'}>{statusLabels[status]}</Badge>
    {overdue && <Badge tone="warning">Overdue</Badge>}
  </span>;
}

export function Invoices() {
  const workspace = useWorkspace();
  const router = useRouter();
  const { parameters, href } = useListNavigation();
  const id = parameters.get('invoice');
  const creating = parameters.get('new') === '1';
  const editing = parameters.get('edit') === '1';
  const canWrite = workspace.role !== 'VIEWER';
  const isList = !id && !creating;
  const sort = parameters.get('sort') === 'asc' ? 'asc' : 'desc';
  const queryKey = useWorkspaceKey('invoices');
  const filters = new URLSearchParams({ sort });
  for (const key of ['q', 'status', 'after', 'before']) {
    const value = parameters.get(key);
    if (value) filters.set(key, value);
  }
  const list = useQuery({
    queryKey: [...queryKey, filters.toString()],
    queryFn: ({ signal }) => listInvoices(workspace.id, filters, signal),
    enabled: isList,
  });
  const invoice = useQuery({
    queryKey: [...queryKey, 'detail', id], queryFn: ({ signal }) => getInvoice(workspace.id, id!, signal), enabled: !!id,
  });
  const listHref = href({ invoice: null, new: null, edit: null });
  const detailHref = (id: string) => href({ invoice: id, new: null, edit: null });
  const sortHref = href({ sort: sort === 'asc' ? 'desc' : 'asc', before: null, after: null });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="text-title font-semibold">Invoices</h1>
        <div className="flex flex-wrap gap-2">
          {isList && <Link href={`/w/${workspace.slug}/invoices/customers`} className={secondaryAction}>Customers</Link>}
          {isList && canWrite && <Link href={href({ new: '1' })} className={primaryAction}>Create invoice</Link>}
          {!isList && <Link href={listHref} className={secondaryAction}>Back to invoices</Link>}
        </div>
      </header>
      {(creating || editing) && !canWrite && <p className={panelStyle}>Your workspace role can view invoices.</p>}
      {id && invoice.isPending && <Pending>Loading invoice…</Pending>}
      {id && <ErrorNotice error={invoice.error} retry={() => void invoice.refetch()} />}
      {canWrite && (creating || (editing && invoice.data?.status === 'DRAFT')) && (
        <InvoiceForm key={id ?? 'new'} invoice={id ? invoice.data : undefined} listHref={listHref} detailHref={detailHref} />
      )}
      {invoice.data && !(editing && canWrite && invoice.data.status === 'DRAFT') &&
        <InvoiceDetail invoice={invoice.data} editHref={href({ edit: '1' })} />}
      {isList && <section className={`${panelStyle} space-y-4`} aria-label="Invoice list">
        <form key={`${filters.get('q')}/${filters.get('status')}`} className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          router.push(href({ q: String(form.get('q')).trim(), status: String(form.get('status')), before: null, after: null }));
        }}>
          <Field id="invoice-search" name="q" type="search" label="Customer or invoice number" maxLength={120} defaultValue={filters.get('q') ?? ''} />
          <div className="space-y-1">
            <label className="block text-label font-medium" htmlFor="invoice-status">Status</label>
            <select id="invoice-status" name="status" className={fieldStyle} defaultValue={filters.get('status') ?? ''}>
              <option value="">All statuses</option><option value="DRAFT">Draft</option><option value="ISSUED">Issued</option><option value="VOID">Void</option>
            </select>
          </div>
          <Button secondary type="submit">Apply filters</Button>
        </form>
        {list.isPending && <Pending>Loading invoices…</Pending>}
        <ErrorNotice error={list.error} retry={() => void list.refetch()} />
        {list.data?.items.length === 0 && <p className="text-muted">{filters.has('status') || filters.has('q') ? 'No invoices match these filters.' : 'No invoices are recorded yet.'}</p>}
        {!!list.data?.items.length && <>
          <table className="hidden w-full text-left text-label lg:table">
            <thead className="border-b border-divider"><tr>
              <th className="pr-3" scope="col">Invoice</th>
              <th className="pr-3" scope="col">Customer</th>
              <th className="pr-3" scope="col" aria-sort={sort === 'asc' ? 'ascending' : 'descending'}>
                <Link href={sortHref} className="inline-flex min-h-11 items-center underline">Issue date<span className="sr-only"> change sort direction</span></Link>
              </th>
              <th className="pr-3 text-right" scope="col">Total</th>
              <th scope="col">Status</th>
            </tr></thead>
            <tbody className="divide-y divide-divider">
              {list.data.items.map((row) => <tr key={row.id}>
                <td className="pr-3"><Link href={detailHref(row.id)} className="inline-flex min-h-11 items-center font-medium text-action underline">{row.number ?? 'Draft'}</Link></td>
                <td className="break-words pr-3">{row.customer.displayName}</td>
                <td className="pr-3">{formatDate(row.issueDate)}</td>
                <td className="pr-3 text-right whitespace-nowrap tabular-nums">{formatMoney(row.totalKobo)}</td>
                <td><InvoiceStatus {...row} /></td>
              </tr>)}
            </tbody>
          </table>
          <ul className="divide-y divide-divider lg:hidden">
            {list.data.items.map((row) => <li key={row.id} className="space-y-2 py-3">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="break-words font-medium">{row.customer.displayName}</p>
                <p className="tabular-nums">{formatMoney(row.totalKobo)}</p>
              </div>
              <InvoiceStatus {...row} />
              <p className="text-label text-muted">Issue date {formatDate(row.issueDate)}</p>
              <Link href={detailHref(row.id)} className={secondaryAction}>{row.number ?? 'View draft'}</Link>
            </li>)}
          </ul>
          <Pagination nextCursor={list.data.nextCursor} previousCursor={list.data.previousCursor} />
        </>}
      </section>}
    </div>
  );
}

function InvoiceDetail({ invoice, editHref }: { invoice: Invoice; editHref: string }) {
  const workspace = useWorkspace();
  const client = useQueryClient();
  const key = useWorkspaceKey('invoices');
  const command = useCommandKey();
  const dialog = useRef<HTMLDialogElement>(null);
  const [action, setAction] = useState<'issue' | 'void'>('issue');
  const update = useMutation({
    mutationFn: (reason?: string) => {
      const body = { version: invoice.version, ...(action === 'void' && { reason }) };
      return api<Invoice>(`/workspaces/${workspace.id}/invoices/${invoice.id}/${action}`, {
        method: 'POST', body, key: command.for({ action, body }),
      });
    },
    onSuccess: async (row) => {
      client.setQueryData([...key, 'detail', invoice.id], row);
      command.reset();
      dialog.current?.close();
      await client.invalidateQueries({ queryKey: key });
    },
  });

  function confirm(next: 'issue' | 'void') {
    update.reset();
    command.reset();
    setAction(next);
    dialog.current?.showModal();
  }

  return <div className="space-y-4 print:space-y-0">
    <article className={`${panelStyle} space-y-6 print:border-0 print:p-0`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="break-words text-label font-semibold text-muted">{workspace.displayName}</p>
          <h2 className="text-section font-semibold">{invoice.number ?? 'Draft invoice'}</h2>
        </div>
        <InvoiceStatus {...invoice} />
      </header>
      <dl className="grid gap-4 sm:grid-cols-3">
        <div><dt className="text-label text-muted">Bill to</dt><dd className="break-words font-medium">{invoice.customer.displayName}</dd>
          {invoice.customer.email && <dd className="break-all text-label">{invoice.customer.email}</dd>}</div>
        <div><dt className="text-label text-muted">Issue date</dt><dd>{formatDate(invoice.issueDate)}</dd></div>
        <div><dt className="text-label text-muted">Due date</dt><dd>{formatDate(invoice.dueDate)}</dd></div>
      </dl>
      <div className="overflow-x-auto rounded-[var(--radius-control)] border border-divider" role="region" aria-label="Invoice line items" tabIndex={0}>
        <table className="w-full text-left text-label">
          <thead className="border-b border-divider bg-canvas"><tr>
            <th scope="col" className="p-2">Description</th><th scope="col" className="p-2 text-right">Quantity</th>
            <th scope="col" className="p-2 text-right">Unit price</th><th scope="col" className="p-2 text-right">Amount</th>
          </tr></thead>
          <tbody className="divide-y divide-divider">
            {invoice.lines.map((line) => <tr key={line.position} className="break-inside-avoid">
              <td className="min-w-28 break-words p-2">{line.description}</td><td className="p-2 text-right tabular-nums">{line.quantity}</td>
              <td className="whitespace-nowrap p-2 text-right tabular-nums">{formatMoney(line.unitKobo)}</td>
              <td className="whitespace-nowrap p-2 text-right tabular-nums">{formatMoney(line.totalKobo)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <dl className="ml-auto w-full max-w-72 space-y-2">
        <div className="flex flex-wrap justify-between gap-2 border-t border-divider pt-2 font-semibold">
          <dt>Total (NGN)</dt><dd className="tabular-nums">{formatMoney(invoice.totalKobo)}</dd>
        </div>
        {invoice.outstandingKobo !== null && <div className="flex flex-wrap justify-between gap-2">
          <dt>Outstanding</dt><dd className="tabular-nums">{formatMoney(invoice.outstandingKobo)}</dd>
        </div>}
      </dl>
      {invoice.voidReason && <p className="rounded-[var(--radius-control)] bg-[var(--danger-bg)] p-3 text-[var(--danger-fg)]">Void reason {invoice.voidReason}</p>}
    </article>
    <div className="flex flex-wrap gap-3 print:hidden">
      {invoice.status !== 'DRAFT' && <Button onClick={() => window.print()}>Print invoice</Button>}
      {workspace.role !== 'VIEWER' && invoice.status === 'DRAFT' && <>
        <Button onClick={() => confirm('issue')}>Issue invoice</Button>
        <Link className={secondaryAction} href={editHref}>Edit draft</Link>
      </>}
      {workspace.role !== 'VIEWER' && invoice.status === 'OPEN' && <Button secondary onClick={() => confirm('void')}>Void invoice</Button>}
    </div>
    <dialog ref={dialog} aria-labelledby="invoice-action"
      className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-[420px] rounded-[var(--radius-panel)] border border-divider bg-surface p-6 text-ink shadow-[var(--shadow-overlay)] backdrop:bg-slate-950/35 print:hidden">
      <form className="space-y-4" onSubmit={(event) => {
        event.preventDefault();
        update.mutate(String(new FormData(event.currentTarget).get('reason') ?? ''));
      }}>
        <h2 id="invoice-action" className="text-section font-semibold">{action === 'issue' ? 'Issue invoice' : 'Void invoice'}</h2>
        <p>{action === 'issue'
          ? `Issue the draft for ${invoice.customer.displayName} totalling ${formatMoney(invoice.totalKobo)}. This assigns an invoice number and locks its content.`
          : `Void ${invoice.number} for ${invoice.customer.displayName}. The number stays in your invoice history.`}</p>
        {action === 'void' && <Field id="invoice-void-reason" name="reason" label="Reason for voiding" required maxLength={250} />}
        <ErrorNotice error={update.error} />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={update.isPending}>{update.isPending ? 'Saving…' : action === 'issue' ? 'Issue invoice' : 'Void invoice'}</Button>
          <Button secondary onClick={() => dialog.current?.close()} disabled={update.isPending}>Cancel</Button>
        </div>
      </form>
    </dialog>
  </div>;
}
