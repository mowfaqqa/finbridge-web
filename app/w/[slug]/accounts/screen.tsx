'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pagination, useListNavigation } from '@/components/pagination';
import { Badge, Button, ErrorNotice, Field, panelStyle, Pending, primaryAction, secondaryAction } from '@/components/ui';
import { useWorkspace, useWorkspaceKey } from '@/components/workspace-shell';
import { accountLabel, api, ApiError, getAccount, listAccounts, type Account, type AccountInput } from '@/lib/api/client';
import { useCommandKey } from '@/lib/use-command-key';

export function Accounts() {
  const workspace = useWorkspace();
  const { href, parameters } = useListNavigation();
  const id = parameters.get('account');
  const isNew = parameters.get('new') === '1';
  const showList = !id && !isNew;
  const canWrite = workspace.role !== 'VIEWER';
  const filters = new URLSearchParams();
  for (const name of ['before', 'after', 'q']) {
    const value = parameters.get(name);
    if (value) filters.set(name, value);
  }
  const key = useWorkspaceKey('accounts');
  const list = useQuery({ queryKey: [...key, filters.toString()], queryFn: ({ signal }) => listAccounts(workspace.id, filters, signal), enabled: showList });
  const account = useQuery({ queryKey: [...key, 'detail', id], queryFn: ({ signal }) => getAccount(workspace.id, id!, signal), enabled: !!id });
  const listHref = href({ new: null, account: null });
  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-title font-semibold">Statement accounts</h1>
      {showList && canWrite && <Link className={primaryAction} href={href({ new: '1' })}>Add account</Link>}
      {!showList && <Link className={secondaryAction} href={listHref}>Back to accounts</Link>}
    </header>
    {isNew && !canWrite && <p className={panelStyle}>Your workspace role can view statement accounts.</p>}
    {id && account.isPending && <Pending>Loading account…</Pending>}
    {id && <ErrorNotice error={account.error} retry={() => void account.refetch()} />}
    {canWrite && (isNew || account.data) && <AccountForm key={id ?? 'new'} account={account.data} back={listHref} />}
    {account.data && !canWrite && <section className={panelStyle}>
      <h2 className="break-words text-section font-semibold">{accountLabel(account.data)}</h2>
      <p className="mt-2 text-muted">{account.data.active ? 'Active' : 'Inactive'}</p>
    </section>}
    {showList && <section className={`${panelStyle} space-y-4`} aria-label="Statement accounts">
      <p className="text-muted">Use a label and the optional last four digits to identify an account when importing a statement.</p>
      {list.isPending && <Pending>Loading accounts…</Pending>}
      <ErrorNotice error={list.error} retry={() => void list.refetch()} />
      {list.data?.items.length === 0 && <p>No statement accounts are recorded yet.</p>}
      {!!list.data?.items.length && <ul className="divide-y divide-divider">
        {list.data.items.map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <Link className="inline-flex min-h-11 items-center break-words font-medium text-action underline" href={href({ account: row.id })}>
            {accountLabel(row)}
          </Link>
          <Badge tone={row.active ? 'success' : 'neutral'}>{row.active ? 'Active' : 'Inactive'}</Badge>
        </li>)}
      </ul>}
      {list.data && <Pagination nextCursor={list.data.nextCursor} previousCursor={list.data.previousCursor} />}
    </section>}
  </div>;
}

function AccountForm({ account, back }: { account?: Account; back: string }) {
  const workspace = useWorkspace();
  const client = useQueryClient();
  const router = useRouter();
  const key = useWorkspaceKey('accounts');
  const command = useCommandKey();
  const save = useMutation({
    mutationFn: (input: AccountInput) => {
      const body = account ? { ...input, version: account.version } : input;
      return api<Account>(`/workspaces/${workspace.id}/accounts${account ? '/' + account.id : ''}`, {
        method: account ? 'PATCH' : 'POST', body, key: command.for(body),
      });
    },
    onSuccess: async () => {
      command.reset();
      await client.invalidateQueries({ queryKey: key });
      router.push(back);
    },
  });
  const errors = save.error instanceof ApiError ? save.error.fields : {};
  return <form className={`${panelStyle} max-w-[640px] space-y-4`} onSubmit={(event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save.mutate({ label: String(form.get('label')).trim(), lastFour: String(form.get('lastFour')).trim() || null });
  }}>
    <h2 className="text-section font-semibold">{account ? 'Edit statement account' : 'Add statement account'}</h2>
    <ErrorNotice error={save.error} fieldLinks={{ label: 'account-label', lastFour: 'last-four' }} />
    <Field id="account-label" name="label" label="Account label" required maxLength={80} defaultValue={account?.label} error={errors.label?.[0]} />
    <Field id="last-four" name="lastFour" label="Last four digits (optional)" inputMode="numeric" pattern="[0-9]{4}"
      maxLength={4} defaultValue={account?.lastFour ?? ''} error={errors.lastFour?.[0]} />
    <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving account…' : 'Save account'}</Button>
  </form>;
}
