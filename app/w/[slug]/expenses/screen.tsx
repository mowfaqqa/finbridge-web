'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef } from 'react';
import { Pagination, useListNavigation } from '@/components/pagination';
import { Badge, Button, ErrorNotice, Field, fieldStyle, panelStyle, Pending, primaryAction, secondaryAction } from '@/components/ui';
import { useWorkspace, useWorkspaceKey } from '@/components/workspace-shell';
import { api, ApiError, getExpense, listExpenses, type Expense, type ExpenseInput } from '@/lib/api/client';
import { decimalToKobo, formatDate, formatMoney, koboToDecimal, todayInLagos } from '@/lib/format';
import { useCommandKey } from '@/lib/use-command-key';

const categories: Record<Expense['category'], string> = {
  SUPPLIES: 'Supplies', RENT_AND_UTILITIES: 'Rent and utilities', TRANSPORT: 'Transport',
  PAYROLL: 'Payroll', FEES: 'Fees', OTHER: 'Other',
};
const statuses = { ACTIVE: 'Active', VOID: 'Void' };

function Category({ id, value, optional }: { id: string; value: string; optional?: boolean }) {
  return <div className="space-y-1">
    <label className="block text-label font-medium" htmlFor={id}>Category</label>
    <select id={id} name="category" className={fieldStyle} defaultValue={value} required={!optional}>
      <option value="">{optional ? 'All categories' : 'Choose a category'}</option>
      {Object.entries(categories).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
    </select>
  </div>;
}

function ExpenseStatus({ status }: Pick<Expense, 'status'>) {
  return <Badge tone={status === 'VOID' ? 'danger' : 'neutral'}>{statuses[status]}</Badge>;
}

export function Expenses() {
  const workspace = useWorkspace();
  const router = useRouter();
  const { parameters, href } = useListNavigation();
  const id = parameters.get('expense');
  const isNew = parameters.get('new') === '1';
  const editing = parameters.get('edit') === '1';
  const canWrite = workspace.role !== 'VIEWER';
  const isList = !id && !isNew;
  const sort = parameters.get('sort') === 'asc' ? 'asc' : 'desc';
  const filters = new URLSearchParams({ sort });
  for (const key of ['q', 'status', 'category', 'after', 'before']) {
    const value = parameters.get(key);
    if (value) filters.set(key, value);
  }
  const key = useWorkspaceKey('expenses');
  const list = useQuery({ queryKey: [...key, filters.toString()], queryFn: ({ signal }) => listExpenses(workspace.id, filters, signal), enabled: isList });
  const expense = useQuery({ queryKey: [...key, 'detail', id], queryFn: ({ signal }) => getExpense(workspace.id, id!, signal), enabled: !!id });
  const isForm = canWrite && (isNew || (editing && expense.data?.status === 'ACTIVE'));
  const listHref = href({ expense: null, new: null, edit: null });
  const detailHref = (id: string) => href({ expense: id, new: null, edit: null });
  const sortHref = href({ sort: sort === 'asc' ? 'desc' : 'asc', after: null, before: null });

  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-title font-semibold">Expenses</h1>
      {isList && canWrite && <Link href={href({ new: '1' })} className={primaryAction}>Record expense</Link>}
      {!isList && <Link href={listHref} className={secondaryAction}>Back to expenses</Link>}
    </header>
    {(isNew || editing) && !canWrite && <p className={panelStyle}>Your workspace role can view expenses.</p>}
    {id && expense.isPending && <Pending>Loading expense…</Pending>}
    {id && <ErrorNotice error={expense.error} retry={() => void expense.refetch()} />}
    {isForm && <ExpenseForm key={id ?? 'new'} expense={expense.data} goTo={detailHref} />}
    {expense.data && !isForm && <ExpenseDetail expense={expense.data} editHref={href({ edit: '1' })} />}
    {isList && <section className={`${panelStyle} space-y-4`} aria-label="Expense list">
      <form key={`${filters.get('q')}/${filters.get('category')}/${filters.get('status')}`} className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        router.push(href({ q: String(form.get('q')).trim(), category: String(form.get('category')),
          status: String(form.get('status')), after: null, before: null }));
      }}>
        <Field id="expense-search" name="q" label="Payee or reference" type="search" maxLength={120} defaultValue={filters.get('q') ?? ''} />
        <Category id="filter-category" value={filters.get('category') ?? ''} optional />
        <div className="space-y-1">
          <label className="block text-label font-medium" htmlFor="filter-status">Status</label>
          <select id="filter-status" name="status" className={fieldStyle} defaultValue={filters.get('status') ?? ''}>
            <option value="">All statuses</option><option value="ACTIVE">Active</option><option value="VOID">Void</option>
          </select>
        </div>
        <Button secondary type="submit">Apply filters</Button>
      </form>
      {list.isPending && <Pending>Loading expenses…</Pending>}
      <ErrorNotice error={list.error} retry={() => void list.refetch()} />
      {list.data?.items.length === 0 && <p className="text-muted">{filters.size > 1 ? 'No expenses match these filters.' : 'No expenses are recorded yet.'}</p>}
      {!!list.data?.items.length && <>
        <table className="hidden w-full text-left text-label lg:table">
          <thead className="border-b border-divider"><tr>
            <th scope="col" className="pr-3">Payee</th>
            <th scope="col" className="pr-3" aria-sort={sort === 'asc' ? 'ascending' : 'descending'}>
              <Link href={sortHref} className="inline-flex min-h-11 items-center underline">Date<span className="sr-only"> change sort direction</span></Link>
            </th>
            <th scope="col" className="pr-3">Category</th><th scope="col" className="pr-3 text-right">Amount</th><th scope="col">Status</th>
          </tr></thead>
          <tbody className="divide-y divide-divider">
            {list.data.items.map((row) => <tr key={row.id}>
              <td className="break-words pr-3"><Link href={detailHref(row.id)} className="inline-flex min-h-11 items-center font-medium text-action underline">{row.payee}</Link></td>
              <td className="pr-3">{formatDate(row.date)}</td><td className="pr-3">{categories[row.category]}</td>
              <td className="whitespace-nowrap pr-3 text-right tabular-nums">{formatMoney(row.amountKobo)}</td><td><ExpenseStatus {...row} /></td>
            </tr>)}
          </tbody>
        </table>
        <ul className="divide-y divide-divider lg:hidden">
          {list.data.items.map((row) => <li key={row.id} className="space-y-2 py-3">
            <div className="flex flex-wrap justify-between gap-2">
              <Link href={detailHref(row.id)} className="inline-flex min-h-11 items-center break-words font-medium text-action underline">{row.payee}</Link>
              <p className="tabular-nums">{formatMoney(row.amountKobo)}</p>
            </div>
            <ExpenseStatus {...row} /><p className="text-label text-muted">{formatDate(row.date)} · {categories[row.category]}</p>
          </li>)}
        </ul>
        <Pagination nextCursor={list.data.nextCursor} previousCursor={list.data.previousCursor} />
      </>}
    </section>}
  </div>;
}

function ExpenseForm({ expense, goTo }: { expense?: Expense; goTo: (id: string) => string }) {
  const workspace = useWorkspace();
  const client = useQueryClient();
  const router = useRouter();
  const key = useWorkspaceKey('expenses');
  const command = useCommandKey();
  const save = useMutation({
    mutationFn: (form: FormData) => {
      const amountKobo = decimalToKobo(String(form.get('amount') ?? ''));
      if (amountKobo === null) throw new ApiError(422, 'AMOUNT_INVALID', 'Use an NGN amount with up to two decimal places.', { amountKobo: ['Enter an amount such as 25000.00'] });
      const input: ExpenseInput = {
        date: String(form.get('date')), payee: String(form.get('payee')), amountKobo,
        category: form.get('category') as ExpenseInput['category'], reference: String(form.get('reference')).trim() || null,
      };
      const body = expense ? { ...input, version: expense.version } : input;
      return api<Expense>(`/workspaces/${workspace.id}/expenses${expense ? '/' + expense.id : ''}`, {
        method: expense ? 'PATCH' : 'POST', body, key: command.for(body),
      });
    },
    onSuccess: async (row) => {
      command.reset();
      await client.invalidateQueries({ queryKey: key });
      router.push(goTo(row.id));
    },
  });
  const errors = save.error instanceof ApiError ? save.error.fields : {};
  return <form className={`${panelStyle} max-w-[640px] space-y-4`} onSubmit={(event) => {
    event.preventDefault();
    if (!save.isPending) save.mutate(new FormData(event.currentTarget));
  }}>
    <h2 className="text-section font-semibold">{expense ? 'Edit expense' : 'Record expense'}</h2>
    <ErrorNotice error={save.error} fieldLinks={{ payee: 'payee', date: 'expense-date', amountKobo: 'amount', reference: 'reference', category: 'expense-category' }} />
    <Field id="payee" name="payee" label="Payee" maxLength={120} required defaultValue={expense?.payee} error={errors.payee?.[0]} />
    <Field id="expense-date" name="date" label="Expense date" type="date" required defaultValue={expense?.date ?? todayInLagos()} error={errors.date?.[0]} />
    <Category id="expense-category" value={expense?.category ?? ''} />
    <Field id="amount" name="amount" label="Amount (NGN)" inputMode="decimal" maxLength={15} required defaultValue={expense && koboToDecimal(expense.amountKobo)} error={errors.amountKobo?.[0]} />
    <Field id="reference" name="reference" label="Reference (optional)" maxLength={120} defaultValue={expense?.reference ?? ''} error={errors.reference?.[0]} />
    <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving expense…' : 'Save expense'}</Button>
  </form>;
}

function ExpenseDetail({ expense, editHref }: { expense: Expense; editHref: string }) {
  const workspace = useWorkspace();
  const client = useQueryClient();
  const key = useWorkspaceKey('expenses');
  const dialog = useRef<HTMLDialogElement>(null);
  const command = useCommandKey();
  const voidExpense = useMutation({
    mutationFn: (reason: string) => {
      const body = { reason, version: expense.version };
      return api<Expense>(`/workspaces/${workspace.id}/expenses/${expense.id}/void`, {
        method: 'POST', body, key: command.for(body),
      });
    },
    onSuccess: async (row) => {
      client.setQueryData([...key, 'detail', expense.id], row);
      dialog.current?.close();
      command.reset();
      await client.invalidateQueries({ queryKey: key });
    },
  });

  return <section className={`${panelStyle} max-w-[640px] space-y-4`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <h2 className="break-words text-section font-semibold">{expense.payee}</h2>
      <ExpenseStatus {...expense} />
    </div>
    <dl className="grid gap-4 sm:grid-cols-2">
      <div><dt className="text-label text-muted">Amount</dt><dd className="font-medium tabular-nums">{formatMoney(expense.amountKobo)}</dd></div>
      <div><dt className="text-label text-muted">Date</dt><dd>{formatDate(expense.date)}</dd></div>
      <div><dt className="text-label text-muted">Category</dt><dd>{categories[expense.category]}</dd></div>
      <div><dt className="text-label text-muted">Reference</dt><dd className="break-words">{expense.reference ?? '—'}</dd></div>
    </dl>
    {expense.voidReason && <p className="text-[var(--danger-fg)]">Void reason {expense.voidReason}</p>}
    {workspace.role !== 'VIEWER' && expense.status === 'ACTIVE' && <div className="flex flex-wrap gap-3">
      <Link className={primaryAction} href={editHref}>Edit expense</Link>
      <Button secondary onClick={() => { voidExpense.reset(); command.reset(); dialog.current?.showModal(); }}>Void expense</Button>
    </div>}
    <dialog ref={dialog} aria-labelledby="void-expense"
      className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-[420px] rounded-[var(--radius-panel)] border border-divider bg-surface p-6 text-ink shadow-[var(--shadow-overlay)] backdrop:bg-slate-950/35">
      <form className="space-y-4" onSubmit={(event) => {
        event.preventDefault();
        voidExpense.mutate(String(new FormData(event.currentTarget).get('reason')));
      }}>
        <h2 id="void-expense" className="text-section font-semibold">Void expense</h2>
        <p className="break-words">Void the {formatMoney(expense.amountKobo)} expense for {expense.payee}.</p>
        <Field id="expense-void-reason" name="reason" label="Reason for voiding" required maxLength={250} />
        <ErrorNotice error={voidExpense.error} />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={voidExpense.isPending}>{voidExpense.isPending ? 'Voiding expense…' : 'Void expense'}</Button>
          <Button secondary onClick={() => dialog.current?.close()} disabled={voidExpense.isPending}>Cancel</Button>
        </div>
      </form>
    </dialog>
  </section>;
}
