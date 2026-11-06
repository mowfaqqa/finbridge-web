import type { paths } from './contract';

type Get<P extends keyof paths> = paths[P] extends { get: { responses: { 200: { content: { 'application/json': infer T } } } } } ? T : never;
type Created<P extends keyof paths> = paths[P] extends { post: { responses: { 201: { content: { 'application/json': infer T } } } } } ? T : never;
type Body<P extends keyof paths> = paths[P] extends { post: { requestBody: { content: { 'application/json': infer T } } } } ? T : never;

export type Workspace = Get<'/api/v1/workspaces/{wid}'>;
export type CreateWorkspace = Body<'/api/v1/workspaces'>;
export type Persona = Body<'/api/v1/auth/local-session'>['persona'];

export class ApiError extends Error {
  constructor(
    readonly status: number, readonly code: string, message: string,
    readonly fields: Record<string, string[]> = {}, readonly requestId?: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, options?: { method?: string; body?: unknown; key?: string; signal?: AbortSignal }): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method: options?.method ?? 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
    signal: options?.signal,
    body: options?.body === undefined ? undefined : JSON.stringify(options.body),
    headers: {
      Accept: 'application/json',
      ...(options?.body !== undefined && { 'Content-Type': 'application/json' }),
      ...(options?.key && { 'Idempotency-Key': options.key }),
    },
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    throw new ApiError(response.status, problem.code ?? 'REQUEST_FAILED', problem.title ?? 'The request failed. Try again.', problem.fieldErrors, problem.requestId);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export const authOptions = (signal?: AbortSignal) => api<Get<'/api/v1/auth/options'>>('/auth/options', { signal });
export const getSession = (signal?: AbortSignal) => api<Get<'/api/v1/auth/session'>>('/auth/session', { signal }).catch((error) => {
  if (error instanceof ApiError && error.status === 401) return null;
  throw error;
});
export const localSignIn = (persona: Persona) => api<Created<'/api/v1/auth/local-session'>>('/auth/local-session', { method: 'POST', body: { persona } });
export const signOut = () => api<void>('/auth/logout', { method: 'POST' });
export const getWorkspaces = (signal?: AbortSignal) => api<Get<'/api/v1/workspaces'>>('/workspaces', { signal });
export const createWorkspace = (body: CreateWorkspace, key: string) =>
  api<Created<'/api/v1/workspaces'>>('/workspaces', { method: 'POST', body, key });
export const getWorkspace = (id: string, signal?: AbortSignal) => api<Workspace>(`/workspaces/${encodeURIComponent(id)}`, { signal });

export type Member = Get<'/api/v1/workspaces/{wid}/members'>[number];
export type InvitationInput = Body<'/api/v1/workspaces/{wid}/invitations'>;
export type Invitation = Created<'/api/v1/workspaces/{wid}/invitations'>;

export const listMembers = (id: string, signal?: AbortSignal) =>
  api<Member[]>(`/workspaces/${id}/members`, { signal });
export const inviteMember = (id: string, body: InvitationInput, key: string) =>
  api<Invitation>(`/workspaces/${id}/invitations`, { method: 'POST', body, key });
export const acceptInvitation = (token: string, key: string) =>
  api<Workspace>('/invitations/accept', { method: 'POST', body: { token }, key });

export type Customer = Get<'/api/v1/workspaces/{wid}/customers/{cid}'>;
export type CustomerInput = Body<'/api/v1/workspaces/{wid}/customers'>;
export const listCustomers = (id: string, filters: URLSearchParams, signal?: AbortSignal) =>
  api<Get<'/api/v1/workspaces/{wid}/customers'>>(`/workspaces/${id}/customers?${filters}`, { signal });
export const getCustomer = (id: string, customerId: string, signal?: AbortSignal) =>
  api<Customer>(`/workspaces/${id}/customers/${encodeURIComponent(customerId)}`, { signal });

export type Invoice = Get<'/api/v1/workspaces/{wid}/invoices/{iid}'>;
export type InvoiceInput = Body<'/api/v1/workspaces/{wid}/invoices'>;
export const listInvoices = (id: string, filters: URLSearchParams, signal?: AbortSignal) =>
  api<Get<'/api/v1/workspaces/{wid}/invoices'>>(`/workspaces/${id}/invoices?${filters}`, { signal });
export const getInvoice = (id: string, invoiceId: string, signal?: AbortSignal) =>
  api<Invoice>(`/workspaces/${id}/invoices/${encodeURIComponent(invoiceId)}`, { signal });

export type Expense = Get<'/api/v1/workspaces/{wid}/expenses/{eid}'>;
export type ExpenseInput = Body<'/api/v1/workspaces/{wid}/expenses'>;
export const listExpenses = (id: string, filters: URLSearchParams, signal?: AbortSignal) =>
  api<Get<'/api/v1/workspaces/{wid}/expenses'>>(`/workspaces/${id}/expenses?${filters}`, { signal });
export const getExpense = (id: string, expenseId: string, signal?: AbortSignal) =>
  api<Expense>(`/workspaces/${id}/expenses/${encodeURIComponent(expenseId)}`, { signal });

export type Settlement = Get<'/api/v1/workspaces/{wid}/invoices/{iid}/settlements'>['items'][number];
export type SettlementInput = Body<'/api/v1/workspaces/{wid}/invoices/{iid}/settlements'>;
export const listSettlements = (id: string, invoiceId: string, filters: URLSearchParams, signal?: AbortSignal) =>
  api<Get<'/api/v1/workspaces/{wid}/invoices/{iid}/settlements'>>(`/workspaces/${id}/invoices/${invoiceId}/settlements?${filters}`, { signal });

export type Account = Get<'/api/v1/workspaces/{wid}/accounts/{aid}'>;
export type AccountInput = Body<'/api/v1/workspaces/{wid}/accounts'>;
export const listAccounts = (id: string, filters: URLSearchParams, signal?: AbortSignal) =>
  api<Get<'/api/v1/workspaces/{wid}/accounts'>>(`/workspaces/${id}/accounts?${filters}`, { signal });
export const getAccount = (id: string, accountId: string, signal?: AbortSignal) =>
  api<Account>(`/workspaces/${id}/accounts/${encodeURIComponent(accountId)}`, { signal });
export const accountLabel = (account: Pick<Account, 'label' | 'lastFour'>) =>
  account.lastFour ? `${account.label} · •••• ${account.lastFour}` : account.label;

export type ImportBatch = Get<'/api/v1/workspaces/{wid}/imports/{bid}'>;
export type ImportRow = Get<'/api/v1/workspaces/{wid}/imports/{bid}/rows'>['items'][number];
export type ImportMapping = Body<'/api/v1/workspaces/{wid}/imports/{bid}/validate'>['mapping'];
export type ImportTicket = Created<'/api/v1/workspaces/{wid}/imports'>;
export const getImport = (id: string, batch: string, signal?: AbortSignal) =>
  api<ImportBatch>(`/workspaces/${id}/imports/${encodeURIComponent(batch)}`, { signal });
export const listImportRows = (id: string, batch: string, filters: URLSearchParams, signal?: AbortSignal) =>
  api<Get<'/api/v1/workspaces/{wid}/imports/{bid}/rows'>>(`/workspaces/${id}/imports/${batch}/rows?${filters}`, { signal });

export async function uploadStatement(ticket: ImportTicket, file: File) {
  const response = await fetch(ticket.uploadUrl, {
    method: 'PUT', credentials: 'same-origin',
    headers: { 'Content-Type': 'text/csv', 'X-Upload-Ticket': ticket.uploadTicket }, body: file,
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    throw new ApiError(response.status, problem.code ?? 'UPLOAD_FAILED', problem.title ?? 'The file could not be uploaded.', problem.fieldErrors, problem.requestId);
  }
  return response.json() as Promise<ImportBatch>;
}

export type StatementLine = Get<'/api/v1/workspaces/{wid}/statement-entries'>['items'][number];
export type StatementDetail = Get<'/api/v1/workspaces/{wid}/statement-entries/{sid}'>;
export type Candidate = Get<'/api/v1/workspaces/{wid}/statement-entries/{sid}/candidates'>[number];
export const listStatements = (id: string, filters: URLSearchParams, signal?: AbortSignal) =>
  api<Get<'/api/v1/workspaces/{wid}/statement-entries'>>(`/workspaces/${id}/statement-entries?${filters}`, { signal });
export const getStatement = (id: string, entry: string, signal?: AbortSignal) =>
  api<StatementDetail>(`/workspaces/${id}/statement-entries/${encodeURIComponent(entry)}`, { signal });
export const getCandidates = (id: string, entry: string, q: string, signal?: AbortSignal) =>
  api<Candidate[]>(`/workspaces/${id}/statement-entries/${entry}/candidates?${new URLSearchParams(q ? { q } : {})}`, { signal });

export type InternalTransfer = StatementDetail['transfers'][number];
export const listTransferCandidates = (id: string, entry: string, filters: URLSearchParams, signal?: AbortSignal) =>
  api<Get<'/api/v1/workspaces/{wid}/statement-entries/{sid}/transfer-candidates'>>(
    `/workspaces/${id}/statement-entries/${entry}/transfer-candidates?${filters}`, { signal },
  );

export type CashFlow = Get<'/api/v1/workspaces/{wid}/reports/cash-flow'>;
export type Receivables = Get<'/api/v1/workspaces/{wid}/reports/receivables'>;
export const getCashFlow = (id: string, filters: URLSearchParams, signal?: AbortSignal) =>
  api<CashFlow>(`/workspaces/${id}/reports/cash-flow?${filters}`, { signal });
export const getReceivables = (id: string, signal?: AbortSignal) =>
  api<Receivables>(`/workspaces/${id}/reports/receivables`, { signal });

export type Readiness = Get<'/api/v1/workspaces/{wid}/evidence/readiness'>;
export type EvidencePack = Get<'/api/v1/workspaces/{wid}/evidence/{eid}'>;
export type EvidenceSummary = Get<'/api/v1/workspaces/{wid}/evidence'>['items'][number];
export const getReadiness = (id: string, signal?: AbortSignal) => api<Readiness>(`/workspaces/${id}/evidence/readiness`, { signal });
export const listEvidence = (id: string, filters: URLSearchParams, signal?: AbortSignal) =>
  api<Get<'/api/v1/workspaces/{wid}/evidence'>>(`/workspaces/${id}/evidence?${filters}`, { signal });
export const getEvidence = (id: string, pack: string, signal?: AbortSignal) =>
  api<EvidencePack>(`/workspaces/${id}/evidence/${encodeURIComponent(pack)}`, { signal });
