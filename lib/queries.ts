import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { getSession, getWorkspaces } from './api/client';

export const sessionQuery = queryOptions({
  queryKey: ['session'],
  queryFn: ({ signal }) => getSession(signal),
  staleTime: 0,
});

export const workspacesQuery = queryOptions({
  queryKey: ['workspaces'],
  queryFn: ({ signal }) => getWorkspaces(signal),
  staleTime: 0,
});

export async function changeIdentity(client: QueryClient, actor: Awaited<ReturnType<typeof getSession>>) {
  await client.cancelQueries();
  client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' && query.queryKey[0] !== 'auth-options' });
  client.setQueryData(sessionQuery.queryKey, actor);
}
