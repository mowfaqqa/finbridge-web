'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, ErrorNotice, Field, panelStyle, Pending, primaryAction, secondaryAction } from '@/components/ui';
import { Pagination, useListNavigation } from '@/components/pagination';
import { useWorkspace, useWorkspaceKey } from '@/components/workspace-shell';
import { api, ApiError, getCustomer, listCustomers, type Customer, type CustomerInput } from '@/lib/api/client';
import { useCommandKey } from '@/lib/use-command-key';

export function Customers() {
  const workspace = useWorkspace();
  const router = useRouter();
  const { href, parameters } = useListNavigation();
  const id = parameters.get('customer');
  const isNew = parameters.get('new') === '1';
  const canWrite = workspace.role !== 'VIEWER';
  const sort = parameters.get('sort') === 'desc' ? 'desc' : 'asc';
  const filters = new URLSearchParams({ sort });
  for (const name of ['q', 'after', 'before']) {
    const value = parameters.get(name);
    if (value) filters.set(name, value);
  }
  const collection = useWorkspaceKey('customers');
  const results = useQuery({
    queryKey: [...collection, filters.toString()],
    queryFn: ({ signal }) => listCustomers(workspace.id, filters, signal),
  });
  const customer = useQuery({
    queryKey: [...collection, 'detail', id],
    queryFn: ({ signal }) => getCustomer(workspace.id, id!, signal),
    enabled: !!id,
  });
  const listHref = href({ customer: null, new: null });
  const editHref = (customerId: string) => href({ customer: customerId, new: null });
  const sortHref = href({ sort: sort === 'asc' ? 'desc' : 'asc', before: null, after: null });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-title font-semibold">Customers</h1>
        {canWrite && !id && !isNew && <Link href={href({ new: '1', customer: null })} className={primaryAction}>Add customer</Link>}
      </header>
      {isNew && !canWrite && <p className={panelStyle}>Your workspace role can view customers.</p>}
      {id && customer.isPending && <Pending>Loading customer…</Pending>}
      {id && <ErrorNotice error={customer.error} retry={() => void customer.refetch()} />}
      {canWrite && ((id && customer.data) || isNew) && (
        <CustomerForm key={id ?? 'new'} customer={id ? customer.data : undefined} back={listHref} />
      )}
      {id && customer.data && !canWrite && <section className={panelStyle}>
        <h2 className="text-section font-semibold">{customer.data.displayName}</h2>
        <p className="mt-2 break-all text-muted">{customer.data.email ?? 'No email address recorded'}</p>
        <Link href={listHref} className={`${secondaryAction} mt-3`}>Back to customers</Link>
      </section>}
      {!id && !isNew && (
        <section className={`${panelStyle} space-y-4`} aria-label="Customer list">
          <form key={filters.get('q') ?? ''} className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
            event.preventDefault();
            const value = new FormData(event.currentTarget).get('q');
            router.push(href({ q: String(value ?? '').trim(), before: null, after: null }));
          }}>
            <Field id="customer-search" name="q" type="search" label="Search customers" maxLength={120} defaultValue={filters.get('q') ?? ''} />
            <Button secondary type="submit">Search</Button>
          </form>
          {results.isPending && <Pending>Loading customers…</Pending>}
          <ErrorNotice error={results.error} retry={() => void results.refetch()} />
          {results.data?.items.length === 0 && <p className="text-muted">{filters.get('q') ? 'No customers match this search.' : 'No customers are recorded yet.'}</p>}
          {!!results.data?.items.length && (
            <>
              <table className="hidden w-full table-fixed text-left text-label sm:table">
                <thead className="border-b border-divider">
                  <tr>
                    <th scope="col" aria-sort={sort === 'asc' ? 'ascending' : 'descending'}>
                      <Link href={sortHref} className="inline-flex min-h-11 items-center underline">
                        Customer name <span className="sr-only">{sort === 'asc' ? 'sort descending' : 'sort ascending'}</span>
                      </Link>
                    </th>
                    <th scope="col">Email</th>
                    <th scope="col"><span className="sr-only">Details</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider">
                  {results.data.items.map((row) => <tr key={row.id}>
                    <td className="break-words py-3 pr-3 font-medium">{row.displayName}</td>
                    <td className="break-all py-3 pr-3 text-muted">{row.email ?? '—'}</td>
                    <td className="py-2 text-right">
                      <Link className={secondaryAction} href={editHref(row.id)} aria-label={`View ${row.displayName}`}>View</Link>
                    </td>
                  </tr>)}
                </tbody>
              </table>
              <div className="space-y-3 sm:hidden">
                <Link className={secondaryAction} href={sortHref}>Name {sort === 'asc' ? 'A to Z' : 'Z to A'}</Link>
                <ul className="divide-y divide-divider">
                  {results.data.items.map((row) => <li key={row.id} className="space-y-1 py-3">
                    <p className="break-words font-medium">{row.displayName}</p>
                    <p className="break-all text-label text-muted">{row.email ?? 'No email address recorded'}</p>
                    <Link className={secondaryAction} href={editHref(row.id)} aria-label={`View ${row.displayName}`}>View</Link>
                  </li>)}
                </ul>
              </div>
              <Pagination nextCursor={results.data.nextCursor} previousCursor={results.data.previousCursor} />
            </>
          )}
        </section>
      )}
    </div>
  );
}

function CustomerForm({ customer, back }: { customer?: Customer; back: string }) {
  const router = useRouter();
  const workspace = useWorkspace();
  const queryKey = useWorkspaceKey('customers');
  const client = useQueryClient();
  const command = useCommandKey();
  const save = useMutation({
    mutationFn: (input: CustomerInput) => {
      const body = customer ? { ...input, version: customer.version } : input;
      const path = `/workspaces/${workspace.id}/customers${customer ? '/' + customer.id : ''}`;
      return api<Customer>(path, { method: customer ? 'PATCH' : 'POST', body, key: command.for(body) });
    },
    onSuccess: async () => {
      command.reset();
      await client.invalidateQueries({ queryKey });
      router.push(back);
    },
  });
  const fields = save.error instanceof ApiError ? save.error.fields : {};
  return (
    <form className={`${panelStyle} max-w-[640px] space-y-4`} onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      save.mutate({ displayName: String(form.get('displayName')).trim(), email: String(form.get('email')).trim() || null });
    }}>
      <h2 className="text-section font-semibold">{customer ? 'Edit customer' : 'Add customer'}</h2>
      <ErrorNotice error={save.error} fieldLinks={{ displayName: 'customer-name', email: 'customer-email' }} />
      <Field id="customer-name" name="displayName" label="Customer display name" required maxLength={120} defaultValue={customer?.displayName} error={fields.displayName?.[0]} />
      <Field id="customer-email" name="email" type="email" label="Email (optional)" maxLength={254} defaultValue={customer?.email ?? ''} error={fields.email?.[0]} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save customer'}</Button>
        <Link className={secondaryAction} href={back}>Back to customers</Link>
      </div>
    </form>
  );
}
