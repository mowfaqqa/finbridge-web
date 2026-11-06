'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Pagination, useListNavigation } from '@/components/pagination';
import { Badge, Button, ErrorNotice, Field, fieldStyle, panelStyle, Pending, secondaryAction } from '@/components/ui';
import { useWorkspace, useWorkspaceKey } from '@/components/workspace-shell';
import { accountLabel, api, ApiError, getImport, listAccounts, listImportRows, uploadStatement, type ImportBatch, type ImportMapping, type ImportTicket } from '@/lib/api/client';
import { formatDate, formatMoney } from '@/lib/format';
import { useCommandKey } from '@/lib/use-command-key';

const activeJobs = (state?: ImportBatch['state']) => state === 'VALIDATING' || state === 'COMMIT_QUEUED';
const stages = ['Upload', 'Map columns', 'Review rows', 'Publish'];
const status = {
  UPLOADED: 'Uploaded', VALIDATING: 'Validating', REVIEW: 'Review', COMMIT_QUEUED: 'Commit queued',
  COMMITTED: 'Committed', FAILED: 'Failed', DISCARDED: 'Discarded',
};

export function ImportStatement() {
  const workspace = useWorkspace();
  const { parameters, href } = useListNavigation();
  const id = parameters.get('batch');
  const key = useWorkspaceKey('imports');
  const batch = useQuery({
    queryKey: [...key, id], queryFn: ({ signal }) => getImport(workspace.id, id!, signal), enabled: !!id,
    refetchInterval: (query) => activeJobs(query.state.data?.state) ? Math.min(800 * 1.5 ** Math.min(query.state.dataUpdateCount, 5), 6_000) : false,
  });
  const value = batch.data;
  const canWrite = workspace.role !== 'VIEWER';
  let step = id ? 1 : 0;
  if (value?.state === 'REVIEW') step = 2;
  if (value?.state === 'COMMIT_QUEUED' || value?.state === 'COMMITTED') step = 3;

  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-title font-semibold">Import statement</h1>
      {id && canWrite && <Link className={secondaryAction} href={href({ batch: null, before: null, after: null, filter: null })}>Start another import</Link>}
    </header>
    <ol className="grid gap-2 text-label sm:grid-cols-4" aria-label="Statement import steps">
      {stages.map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined}
        className={`rounded-[var(--radius-control)] border p-2 ${step === index ? 'border-action bg-surface font-semibold text-action' : 'border-divider text-muted'}`}>
        {index + 1}. {label}{index < step && <span className="sr-only"> complete</span>}
      </li>)}
    </ol>
    {!id && (canWrite ? <Upload /> : <p className={panelStyle}>Your workspace role can view import results.</p>)}
    {id && batch.isPending && <Pending>Loading import…</Pending>}
    {id && <ErrorNotice error={batch.error} retry={() => void batch.refetch()} />}
    {value && <ImportStatus key={value.id} batch={value} />}
  </div>;
}

function Upload() {
  const workspace = useWorkspace();
  const router = useRouter();
  const { href } = useListNavigation();
  const key = useWorkspaceKey('accounts');
  const command = useCommandKey();
  const [cursor, setCursor] = useState<{ after?: string; before?: string }>({});
  const filters = new URLSearchParams({ active: 'true', ...cursor });
  const accounts = useQuery({ queryKey: [...key, filters.toString()], queryFn: ({ signal }) => listAccounts(workspace.id, filters, signal) });
  const upload = useMutation({
    mutationFn: async ({ accountId, file }: { accountId: string; file: File }) => {
      if (file.size === 0 || file.size > 5 * 1024 * 1024 || !file.name.toLowerCase().endsWith('.csv')) {
        throw new ApiError(422, 'CSV_REQUIRED', 'Choose a UTF-8 CSV file up to 5 MiB.');
      }
      const body = { accountId, filename: file.name, bytes: file.size };
      const ticket = await api<ImportTicket>(`/workspaces/${workspace.id}/imports`, {
        method: 'POST', body, key: command.for({ ...body, modified: file.lastModified }),
      });
      return uploadStatement(ticket, file);
    },
    onSuccess: (batch) => router.push(href({ batch: batch.id })),
  });

  return <form className={`${panelStyle} max-w-[640px] space-y-4`} onSubmit={(event) => {
    event.preventDefault();
    if (upload.isPending) return;
    const form = new FormData(event.currentTarget);
    const file = form.get('statement');
    if (file instanceof File) upload.mutate({ accountId: String(form.get('account')), file });
  }}>
    <h2 className="text-section font-semibold">Choose an account and file</h2>
    <p className="text-muted">Upload a UTF-8 CSV with up to 10,000 data rows. You can check and resolve the rows before publishing.</p>
    <a className={secondaryAction} href="/finbridge-statement-template.csv" download>Download CSV template</a>
    <ErrorNotice error={upload.error} />
    <ErrorNotice error={accounts.error} retry={() => void accounts.refetch()} />
    <div className="space-y-1">
      <label htmlFor="import-account" className="block text-label font-medium">Statement account</label>
      <select id="import-account" name="account" className={fieldStyle} required defaultValue="">
        <option value="">{accounts.isPending ? 'Loading accounts…' : 'Choose an account'}</option>
        {accounts.data?.items.map((account) => <option value={account.id} key={account.id}>{accountLabel(account)}</option>)}
      </select>
    </div>
    {accounts.data && <div className="flex flex-wrap gap-2">
      {accounts.data.previousCursor && <Button secondary onClick={() => setCursor({ before: accounts.data!.previousCursor! })}>Previous accounts</Button>}
      {accounts.data.nextCursor && <Button secondary onClick={() => setCursor({ after: accounts.data!.nextCursor! })}>More accounts</Button>}
    </div>}
    <Link className="inline-flex min-h-11 items-center font-medium text-action underline" href={`/w/${workspace.slug}/accounts?new=1`}>Add a statement account</Link>
    <Field id="statement" name="statement" type="file" accept=".csv,text/csv" label="CSV statement" required hint="Maximum file size 5 MiB." />
    <Button type="submit" disabled={upload.isPending || !accounts.data?.items.length}>{upload.isPending ? 'Uploading statement…' : 'Upload statement'}</Button>
  </form>;
}

function ImportStatus({ batch }: { batch: ImportBatch }) {
  const workspace = useWorkspace();
  const router = useRouter();
  const client = useQueryClient();
  const key = useWorkspaceKey('imports');
  const { href } = useListNavigation();
  const [remap, setRemap] = useState(false);
  const canWrite = workspace.role !== 'VIEWER';
  const commitKey = useCommandKey();
  const confirm = useRef<HTMLDialogElement>(null);
  const discardDialog = useRef<HTMLDialogElement>(null);
  const discardKey = useCommandKey();
  const discard = useMutation({
    mutationFn: (reason: string) => {
      const body = { version: batch.version, reason };
      return api<ImportBatch>(`/workspaces/${workspace.id}/imports/${batch.id}/discard`, {
        method: 'POST', body, key: discardKey.for(body),
      });
    },
    onSuccess: async () => {
      discardDialog.current?.close();
      discardKey.reset();
      await client.invalidateQueries({ queryKey: key });
    },
  });
  const commit = useMutation({
    mutationFn: () => api<{ id: string }>(`/workspaces/${workspace.id}/imports/${batch.id}/commit`, {
      method: 'POST', body: { version: batch.version }, key: commitKey.for(batch.version),
    }),
    onSuccess: async (result) => {
      confirm.current?.close();
      commitKey.reset();
      if (result.id !== batch.id) router.replace(href({ batch: result.id, after: null, before: null }));
      await client.invalidateQueries({ queryKey: key });
    },
  });

  const showMapping = canWrite && batch.uploaded && (batch.state === 'UPLOADED' || batch.state === 'FAILED' || (batch.state === 'REVIEW' && remap));
  const showRows = batch.state === 'REVIEW' || batch.state === 'COMMITTED';
  return <div className="space-y-6">
    <section className={`${panelStyle} space-y-3`} aria-label="Import status">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="break-all text-section font-semibold">{batch.filename}</h2>
        <Badge tone={batch.state === 'COMMITTED' ? 'success' : batch.state === 'FAILED' ? 'danger' : 'info'}>{status[batch.state]}</Badge>
      </div>
      {activeJobs(batch.state) && <Pending>{batch.state === 'VALIDATING' ? 'Validating file and checking duplicate rows…' : 'Publishing statement rows and coverage…'}</Pending>}
      {batch.problemCode && <p role="status" className="rounded-[var(--radius-control)] bg-[var(--warning-bg)] p-3 text-[var(--warning-fg)]">
        {batch.problemCode === 'IMPORT_PREVIEW_STALE'
          ? 'New statement data changed the duplicate check. Review the affected rows before committing again.'
          : batch.problemCode === 'FILE_ALREADY_COMMITTED'
            ? 'This file was already committed with a different mapping. Contact support to correct it.'
            : `The import could not finish. Review the file and retry. Reference ${batch.problemCode}`}
      </p>}
      {batch.coverageStart && batch.coverageEnd && <p>Confirmed coverage {formatDate(batch.coverageStart)} to {formatDate(batch.coverageEnd)}</p>}
      {batch.state === 'COMMITTED' && <div className="space-y-3">
        <p role="status">{batch.acceptedCount} {batch.acceptedCount === 1 ? 'row' : 'rows'} published. Contact support to correct a committed file.</p>
        <Link className={secondaryAction} href={`/w/${workspace.slug}/reconciliation?accountId=${batch.accountId}`}>Open reconciliation</Link>
      </div>}
      {batch.state === 'REVIEW' && <p>{batch.rowCount} rows · {batch.errorCount} errors · {batch.reviewCount} duplicate decisions remaining</p>}
      {batch.state === 'REVIEW' && batch.rowCount === 0 && <p>This statement has no transaction rows. Publishing records the confirmed coverage.</p>}
      {canWrite && batch.state !== 'COMMITTED' && batch.state !== 'DISCARDED' &&
        <Button secondary onClick={() => discardDialog.current?.showModal()}>Discard import</Button>}
      {canWrite && batch.state === 'REVIEW' && <Button secondary onClick={() => setRemap((value) => !value)}>{remap ? 'Hide mapping' : 'Edit mapping'}</Button>}
      {canWrite && !batch.errorCount && !batch.reviewCount && (batch.state === 'REVIEW' || batch.failedStage === 'IMPORT_COMMIT') &&
        <Button onClick={() => confirm.current?.showModal()}>{batch.failedStage === 'IMPORT_COMMIT' ? 'Retry commit' : 'Commit statement'}</Button>}
    </section>
    {showMapping && <MappingForm key={batch.version} batch={batch} onQueued={() => setRemap(false)} />}
    {showRows && <Review batch={batch} />}
    <dialog ref={discardDialog} aria-labelledby="discard-import" className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-[420px] rounded-[var(--radius-panel)] border border-divider bg-surface p-6 text-ink shadow-[var(--shadow-overlay)] backdrop:bg-slate-950/35">
      <form className="space-y-4" onSubmit={(event) => {
        event.preventDefault();
        discard.mutate(String(new FormData(event.currentTarget).get('reason') ?? ''));
      }}>
        <h2 id="discard-import" className="text-section font-semibold">Discard import</h2>
        <p>Discard {batch.filename} and its current review.</p>
        <Field id="discard-reason" name="reason" label="Reason for discarding" maxLength={250} required />
        <ErrorNotice error={discard.error} />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={discard.isPending}>Discard import</Button>
          <Button secondary disabled={discard.isPending} onClick={() => discardDialog.current?.close()}>Cancel</Button>
        </div>
      </form>
    </dialog>
    <dialog ref={confirm} aria-labelledby="publish-import" className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-[420px] rounded-[var(--radius-panel)] border border-divider bg-surface p-6 text-ink shadow-[var(--shadow-overlay)] backdrop:bg-slate-950/35">
      <div className="space-y-4">
        <h2 id="publish-import" className="text-section font-semibold">Commit statement</h2>
        <p>Publish the accepted rows and confirmed coverage for {batch.filename}. Correcting a published file requires support.</p>
        <ErrorNotice error={commit.error} />
        <div className="flex flex-wrap gap-3">
          <Button disabled={commit.isPending} onClick={() => commit.mutate()}>{commit.isPending ? 'Queueing commit…' : 'Commit statement'}</Button>
          <Button secondary disabled={commit.isPending} onClick={() => confirm.current?.close()}>Cancel</Button>
        </div>
      </div>
    </dialog>
  </div>;
}

function MappingForm({ batch, onQueued }: { batch: ImportBatch; onQueued: () => void }) {
  const workspace = useWorkspace();
  const router = useRouter();
  const client = useQueryClient();
  const { href } = useListNavigation();
  const key = useWorkspaceKey('imports');
  const command = useCommandKey();
  const [mode, setMode] = useState(batch.mapping?.money.mode ?? 'signed');
  const saved = batch.mapping;
  const validate = useMutation({
    mutationFn: (form: FormData) => {
      const column = (name: string) => Number(form.get(name));
      const optional = (name: string) => form.get(name) === '' ? undefined : column(name);
      const mapping: ImportMapping = {
        date: column('date'), description: column('description'), reference: optional('reference'), sourceId: optional('sourceId'),
        dateFormat: form.get('dateFormat') as ImportMapping['dateFormat'],
        money: mode === 'signed' ? { mode, amount: column('amount') } : { mode, debit: column('debit'), credit: column('credit') },
      };
      const body = { mapping, coverageStart: String(form.get('coverageStart')), coverageEnd: String(form.get('coverageEnd')), version: batch.version };
      return api<{ id: string }>(`/workspaces/${workspace.id}/imports/${batch.id}/validate`, { method: 'POST', body, key: command.for(body) });
    },
    onSuccess: async (result) => {
      onQueued();
      if (result.id !== batch.id) router.replace(href({ batch: result.id, after: null, before: null }));
      await client.invalidateQueries({ queryKey: key });
    },
  });
  const fallback = (name: string) => batch.headers.findIndex((header) => header.toLowerCase() === name);
  const selectColumn = (name: string, label: string, index: number | undefined, optional = false) => (
    <div className="space-y-1">
      <label htmlFor={`column-${name}`} className="block text-label font-medium">{label}</label>
      <select id={`column-${name}`} name={name} className={fieldStyle} required={!optional}
        defaultValue={index !== undefined && index >= 0 ? String(index) : ''}>
        <option value="">{optional ? 'Skip this field' : 'Select a column'}</option>
        {batch.headers.map((header, i) => <option key={i} value={i}>{header} · column {i + 1}</option>)}
      </select>
    </div>
  );
  return <form className={`${panelStyle} max-w-[640px] space-y-4`} onSubmit={(event) => {
    event.preventDefault();
    if (!validate.isPending) validate.mutate(new FormData(event.currentTarget));
  }}>
    <h2 className="text-section font-semibold">Map columns and confirm coverage</h2>
    <ErrorNotice error={validate.error} fieldLinks={{ coverageStart: 'coverageStart', coverageEnd: 'coverageEnd' }} />
    <div className="grid gap-4 sm:grid-cols-2">
      {selectColumn('date', 'Booking date column', saved?.date ?? fallback('date'))}
      {selectColumn('description', 'Description column', saved?.description ?? fallback('description'))}
      {selectColumn('reference', 'Reference column (optional)', saved?.reference ?? fallback('reference'), true)}
      {selectColumn('sourceId', 'Source transaction ID (optional)', saved?.sourceId ?? fallback('source_id'), true)}
      <div className="space-y-1"><label htmlFor="date-format" className="block text-label font-medium">Date format</label>
        <select id="date-format" name="dateFormat" className={fieldStyle} defaultValue={saved?.dateFormat ?? 'ISO'}>
          <option value="ISO">ISO · YYYY-MM-DD</option><option value="DMY">Day / month / year</option><option value="MDY">Month / day / year</option>
        </select>
      </div>
      <div className="space-y-1"><label htmlFor="amount-mode" className="block text-label font-medium">Amount format</label>
        <select id="amount-mode" className={fieldStyle} value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
          <option value="signed">One signed amount column</option><option value="split">Separate debit and credit columns</option>
        </select>
      </div>
      {mode === 'signed' ? selectColumn('amount', 'Signed amount column', saved?.money.mode === 'signed' ? saved.money.amount : fallback('amount')) : <>
        {selectColumn('debit', 'Debit column', saved?.money.mode === 'split' ? saved.money.debit : fallback('debit'))}
        {selectColumn('credit', 'Credit column', saved?.money.mode === 'split' ? saved.money.credit : fallback('credit'))}
      </>}
    </div>
    <p className="text-muted">Confirm the inclusive dates printed on the source statement, even when the file has only a header.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id="coverageStart" name="coverageStart" label="Coverage start" type="date" defaultValue={batch.coverageStart ?? ''} required />
      <Field id="coverageEnd" name="coverageEnd" label="Coverage end" type="date" defaultValue={batch.coverageEnd ?? ''} required />
    </div>
    <Button type="submit" disabled={validate.isPending}>{validate.isPending ? 'Queueing validation…' : 'Validate statement'}</Button>
  </form>;
}

function Review({ batch }: { batch: ImportBatch }) {
  const workspace = useWorkspace();
  const router = useRouter();
  const client = useQueryClient();
  const { parameters, href } = useListNavigation();
  const key = useWorkspaceKey('imports');
  const command = useCommandKey();
  const filters = new URLSearchParams();
  for (const name of ['before', 'after', 'filter']) {
    const value = parameters.get(name);
    if (value) filters.set(name, value);
  }
  const rows = useQuery({
    queryKey: [...key, batch.id, 'rows', batch.version, filters.toString()],
    queryFn: ({ signal }) => listImportRows(workspace.id, batch.id, filters, signal),
  });
  const resolve = useMutation({
    mutationFn: (choices: { rowId: string; decision: 'KEEP' | 'DUPLICATE' }[]) => {
      const body = { version: batch.version, choices };
      return api<ImportBatch>(`/workspaces/${workspace.id}/imports/${batch.id}/resolutions`, { method: 'PATCH', body, key: command.for(body) });
    },
    onSuccess: async () => {
      command.reset();
      await client.invalidateQueries({ queryKey: key });
    },
  });
  const writable = workspace.role !== 'VIEWER' && batch.state === 'REVIEW';
  return <section className={`${panelStyle} space-y-4`} aria-labelledby="preview-heading">
    <h2 id="preview-heading" className="text-section font-semibold">Statement rows</h2>
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor="row-filter" className="text-label font-medium">Show</label>
      <select id="row-filter" className={`${fieldStyle} w-auto`} value={filters.get('filter') ?? 'all'} onChange={(event) =>
        router.push(href({ filter: event.target.value, after: null, before: null }))}>
        <option value="all">All rows</option><option value="errors">Rows with errors</option><option value="duplicates">Ambiguous duplicates</option>
      </select>
    </div>
    {rows.isPending && <Pending>Loading statement rows…</Pending>}
    <ErrorNotice error={rows.error} retry={() => void rows.refetch()} />
    {rows.data?.items.length === 0 && <p className="text-muted">No rows match this view.</p>}
    {!!rows.data?.items.length && <form key={`${batch.version}/${filters}`} className="space-y-4" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const choices = rows.data!.items.flatMap<{ rowId: string; decision: 'KEEP' | 'DUPLICATE' }>(({ id }) => {
        const decision = form.get(id);
        return decision === 'KEEP' || decision === 'DUPLICATE' ? [{ rowId: id, decision }] : [];
      });
      if (choices.length && !resolve.isPending) resolve.mutate(choices);
    }}>
      <ErrorNotice error={resolve.error} />
      <ul className="divide-y divide-divider">
        {rows.data.items.map((row) => <li key={row.id} className="grid gap-2 py-3 sm:grid-cols-[auto_1fr_auto]">
          <p className="text-label text-muted">Row {row.rowNumber}</p>
          <div className="space-y-1">
            {row.error ? <p className="text-[var(--danger-fg)]">{row.error}</p> : <>
              <p className="break-words font-medium">{row.description}</p>
              {row.bookingDate && <p className="text-label text-muted">{formatDate(row.bookingDate)}</p>}
              {row.ambiguous && <p className="text-label text-muted">{row.previousCount} matching published rows. Review this occurrence.</p>}
              {writable && row.ambiguous ? <div className="max-w-64 space-y-1">
                <label htmlFor={`decision-${row.id}`} className="block text-label font-medium">Decision for row {row.rowNumber}</label>
                <select id={`decision-${row.id}`} name={row.id} className={fieldStyle} defaultValue={row.disposition === 'REVIEW' ? '' : row.disposition}>
                  <option value="">Review required</option><option value="DUPLICATE">Duplicate</option><option value="KEEP">Keep separate</option>
                </select>
              </div> : <Badge tone={row.disposition === 'DUPLICATE' ? 'neutral' : 'success'}>{row.disposition === 'DUPLICATE' ? 'Duplicate' : 'Keep'}</Badge>}
            </>}
          </div>
          {row.amountKobo && <p className="tabular-nums">{formatMoney(row.amountKobo)}</p>}
        </li>)}
      </ul>
      {writable && rows.data.items.some((row) => row.ambiguous && !row.error) && <Button secondary type="submit" disabled={resolve.isPending}>
        {resolve.isPending ? 'Saving decisions…' : 'Save duplicate decisions'}
      </Button>}
    </form>}
    {rows.data && <Pagination nextCursor={rows.data.nextCursor} previousCursor={rows.data.previousCursor} />}
  </section>;
}
