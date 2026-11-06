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
