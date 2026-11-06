'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, type FormEvent } from 'react';
import { Button, ErrorNotice, Field, fieldStyle, panelStyle, Pending, secondaryAction } from '@/components/ui';
import { ApiError, authOptions, createWorkspace, localSignIn, signOut, type CreateWorkspace, type Persona } from '@/lib/api/client';
import { sessionQuery, workspacesQuery } from '@/lib/queries';

const personas: Array<[Persona, string]> = [
  ['owner', 'SME owner'],
  ['operator', 'Finance operator'],
  ['viewer', 'Read-only advisor'],
  ['second-owner', 'Second SME owner'],
];

export default function Onboarding() {
  const client = useQueryClient();
  const router = useRouter();
  const command = useRef<{ request: string; key: string } | null>(null);
  const session = useQuery(sessionQuery);
  const options = useQuery({ queryKey: ['auth-options'], queryFn: ({ signal }) => authOptions(signal), enabled: session.data === null });
  const workspaces = useQuery({ ...workspacesQuery, enabled: !!session.data });
  const login = useMutation({
    mutationFn: localSignIn,
    onSuccess: (actor) => {
      client.clear();
      client.setQueryData(sessionQuery.queryKey, actor);
    },
  });
  const logout = useMutation({
    mutationFn: signOut,
    onSuccess: () => {
      command.current = null;
      client.clear();
      client.setQueryData(sessionQuery.queryKey, null);
    },
  });
  const create = useMutation({
    mutationFn: ({ body, key }: { body: CreateWorkspace; key: string }) => createWorkspace(body, key),
    onSuccess: async (workspace) => {
      command.current = null;
      await client.invalidateQueries({ queryKey: workspacesQuery.queryKey });
      router.push(`/w/${workspace.slug}/overview`);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (create.isPending) return;
    const form = new FormData(event.currentTarget);
    const sector = String(form.get('sector') ?? '').trim();
    const body = { displayName: String(form.get('displayName') ?? '').trim(), ...(sector && { sector }) };
    const request = JSON.stringify(body);
    if (command.current?.request !== request) command.current = { request, key: crypto.randomUUID() };
    create.mutate({ body, key: command.current.key });
  }

  const errors = create.error instanceof ApiError ? create.error.fields : {};
  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[672px] space-y-6 px-4 py-8 sm:px-6 sm:py-12">
      <header>
        <p className="text-label font-semibold text-action">FinBridge OS</p>
        <h1 className="mt-2 text-title font-semibold">{session.data ? 'Business workspace' : 'Sign in to FinBridge OS'}</h1>
      </header>
      {session.isPending && <Pending>Checking your session…</Pending>}
      <ErrorNotice error={session.error} retry={() => void session.refetch()} />
      {session.data === null && (
        <section className={panelStyle}>
          {options.isPending && <Pending>Loading sign-in options…</Pending>}
          <ErrorNotice error={options.error} retry={() => void options.refetch()} />
          {options.data?.localSignIn && (
            <form className="space-y-4" onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              login.mutate(form.get('persona') as Persona);
            }}>
              <p className="text-muted">Choose a synthetic identity for local development.</p>
              <ErrorNotice error={login.error} />
              <div className="space-y-1">
                <label className="block text-label font-medium" htmlFor="persona">Local identity</label>
                <select className={fieldStyle} id="persona" name="persona">
                  {personas.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                </select>
              </div>
              <Button type="submit" disabled={login.isPending}>{login.isPending ? 'Signing in…' : 'Sign in'}</Button>
            </form>
          )}
          {options.data && !options.data.localSignIn && <p>Sign-in is unavailable in this environment.</p>}
        </section>
      )}
      {session.data && (
        <>
          {workspaces.isPending && <Pending>Loading your workspaces…</Pending>}
          <ErrorNotice error={workspaces.error} retry={() => void workspaces.refetch()} />
          {!!workspaces.data?.length && (
            <section className={panelStyle} aria-labelledby="existing-workspaces">
              <h2 id="existing-workspaces" className="text-section font-semibold">Your workspaces</h2>
              <ul className="mt-3 flex flex-wrap gap-3">
                {workspaces.data.map((workspace) => (
                  <li key={workspace.id}><Link className={secondaryAction} href={`/w/${workspace.slug}/overview`}>{workspace.displayName}</Link></li>
                ))}
              </ul>
            </section>
          )}
          <form className={`${panelStyle} space-y-4`} onSubmit={submit} aria-labelledby="create-workspace">
            <h2 id="create-workspace" className="text-section font-semibold">Create a workspace</h2>
            <ErrorNotice error={create.error} fieldLinks={{ displayName: 'displayName', sector: 'sector' }} />
            <Field id="displayName" name="displayName" label="Business display name" required maxLength={120} error={errors.displayName?.[0]} />
            <Field id="sector" name="sector" label="Sector (optional)" maxLength={120} error={errors.sector?.[0]} />
            <Button type="submit" disabled={create.isPending}>{create.isPending ? 'Creating workspace…' : 'Create workspace'}</Button>
          </form>
          <ErrorNotice error={logout.error} />
          <Button secondary disabled={logout.isPending} onClick={() => logout.mutate()}>{logout.isPending ? 'Signing out…' : 'Sign out'}</Button>
        </>
      )}
    </main>
  );
}
