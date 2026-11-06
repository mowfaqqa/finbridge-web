import { queryOptions } from '@tanstack/react-query';
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
