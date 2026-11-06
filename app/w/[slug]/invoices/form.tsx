'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Button, ErrorNotice, Field, fieldStyle, panelStyle, secondaryAction } from '@/components/ui';
import { useWorkspace, useWorkspaceKey } from '@/components/workspace-shell';
import { api, ApiError, getCustomer, listCustomers, type Invoice, type InvoiceInput } from '@/lib/api/client';
import { decimalToKobo, koboToDecimal, todayInLagos } from '@/lib/format';
import { useCommandKey } from '@/lib/use-command-key';

export function InvoiceForm({ invoice, listHref, detailHref }: {
  invoice?: Invoice; listHref: string; detailHref: (id: string) => string;
}) {
  const workspace = useWorkspace();
  const client = useQueryClient();
  const router = useRouter();
  const command = useCommandKey();
  const customerKey = useWorkspaceKey('customers');
  const invoiceKey = useWorkspaceKey('invoices');
  const [customerId, setCustomerId] = useState(invoice?.customerId ?? '');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerPage, setCustomerPage] = useState<{ after?: string; before?: string }>({});
  const [lineIds, setLineIds] = useState(() => invoice?.lines.map((line) => line.position) ?? [1]);
  const sequence = useRef(lineIds.length + 1);

  const filters = new URLSearchParams({ q: customerSearch, ...customerPage });
  const customers = useQuery({
    queryKey: [...customerKey, 'picker', filters.toString()],
    queryFn: ({ signal }) => listCustomers(workspace.id, filters, signal),
  });
  const options = customers.data?.items ?? [];
  const chosen = useQuery({
    queryKey: [...customerKey, 'detail', customerId],
    queryFn: ({ signal }) => getCustomer(workspace.id, customerId, signal),
    enabled: !!customerId && !options.some((option) => option.id === customerId),
  });
  const selectedOption = chosen.data ?? (invoice?.customerId === customerId ? { id: customerId, ...invoice.customer } : null);

  const save = useMutation({
    mutationFn: (form: FormData) => {
      const lines = lineIds.map((id, index) => {
        const unitKobo = decimalToKobo(String(form.get(`unit-${id}`) ?? ''));
        if (unitKobo === null) throw new ApiError(422, 'AMOUNT_INVALID', 'Use an NGN amount with up to two decimal places.', {
          [`lines.${index}.unitKobo`]: ['Enter a price such as 8500.00'],
        });
        return { description: String(form.get(`description-${id}`)), quantity: Number(form.get(`quantity-${id}`)), unitKobo };
      });
      const body: InvoiceInput = {
        customerId, issueDate: String(form.get('issueDate')), dueDate: String(form.get('dueDate')), lines,
      };
      const input = invoice ? { ...body, version: invoice.version } : body;
      return api<Invoice>(`/workspaces/${workspace.id}/invoices${invoice ? '/' + invoice.id : ''}`, {
        method: invoice ? 'PATCH' : 'POST', body: input, key: command.for(input),
      });
    },
    onSuccess: async (row) => {
      command.reset();
      await client.invalidateQueries({ queryKey: invoiceKey });
      router.push(detailHref(row.id));
    },
  });
  const errors = save.error instanceof ApiError ? save.error.fields : {};
  const fieldLinks: Record<string, string> = { customerId: 'invoice-customer', issueDate: 'issueDate', dueDate: 'dueDate' };
  lineIds.forEach((id, index) => {
    fieldLinks[`lines.${index}.description`] = `description-${id}`;
    fieldLinks[`lines.${index}.quantity`] = `quantity-${id}`;
    fieldLinks[`lines.${index}.unitKobo`] = `unit-${id}`;
  });

  return (
    <form className={`${panelStyle} max-w-[640px] space-y-6`} onSubmit={(event) => {
      event.preventDefault();
      if (!save.isPending) save.mutate(new FormData(event.currentTarget));
    }}>
      <h2 className="text-section font-semibold">{invoice ? 'Edit draft invoice' : 'Create draft invoice'}</h2>
      <ErrorNotice error={save.error} fieldLinks={fieldLinks} />
      <div className="space-y-3">
        <Field id="find-customer" type="search" label="Find a customer" maxLength={120} value={customerSearch}
          onChange={(event) => { setCustomerSearch(event.target.value); setCustomerPage({}); }} />
        <ErrorNotice error={customers.error} retry={() => void customers.refetch()} />
        <div className="space-y-1">
          <label htmlFor="invoice-customer" className="block text-label font-medium">Customer</label>
          <select id="invoice-customer" className={fieldStyle} value={customerId} required
            aria-invalid={!!errors.customerId} onChange={(event) => setCustomerId(event.target.value)}>
            <option value="">{customers.isPending ? 'Loading customers…' : 'Choose a customer'}</option>
            {selectedOption && !options.some((option) => option.id === selectedOption.id) &&
              <option value={selectedOption.id}>{selectedOption.displayName}</option>}
            {options.map((option) => <option value={option.id} key={option.id}>{option.displayName}</option>)}
          </select>
        </div>
        {customers.data && <div className="flex flex-wrap gap-2">
          {customers.data.previousCursor && <Button secondary onClick={() => setCustomerPage({ before: customers.data!.previousCursor! })}>Previous customers</Button>}
          {customers.data.nextCursor && <Button secondary onClick={() => setCustomerPage({ after: customers.data!.nextCursor! })}>More customers</Button>}
        </div>}
        <Link href={`/w/${workspace.slug}/invoices/customers?new=1`} className={secondaryAction}>Add a customer</Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="issueDate" name="issueDate" label="Issue date" type="date" required defaultValue={invoice?.issueDate ?? todayInLagos()} error={errors.issueDate?.[0]} />
        <Field id="dueDate" name="dueDate" label="Due date" type="date" required defaultValue={invoice?.dueDate} error={errors.dueDate?.[0]} />
      </div>
      <div className="space-y-4">
        {lineIds.map((id, index) => {
          const previous = invoice?.lines.find((line) => line.position === id);
          return <fieldset key={id} className="space-y-3 rounded-[var(--radius-control)] border border-divider p-4">
            <legend className="px-2 font-medium">Line {index + 1}</legend>
            <Field id={`description-${id}`} name={`description-${id}`} label="Description" required maxLength={500}
              defaultValue={previous?.description} error={errors[`lines.${index}.description`]?.[0]} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id={`quantity-${id}`} name={`quantity-${id}`} label="Quantity" type="number" min={1} max={9999} step={1}
                required defaultValue={previous?.quantity ?? 1} error={errors[`lines.${index}.quantity`]?.[0]} />
              <Field id={`unit-${id}`} name={`unit-${id}`} label="Unit price (NGN)" inputMode="decimal" maxLength={15}
                required defaultValue={previous && koboToDecimal(previous.unitKobo)} error={errors[`lines.${index}.unitKobo`]?.[0]} />
            </div>
            {lineIds.length > 1 && <Button secondary onClick={() => setLineIds((ids) => ids.filter((item) => item !== id))}>Remove line {index + 1}</Button>}
          </fieldset>;
        })}
        <Button secondary disabled={lineIds.length === 50} onClick={() => {
          const next = sequence.current++;
          setLineIds((ids) => [...ids, next]);
        }}>Add line</Button>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving draft…' : 'Save draft'}</Button>
        <Link className={secondaryAction} href={invoice ? detailHref(invoice.id) : listHref}>Cancel</Link>
      </div>
    </form>
  );
}
