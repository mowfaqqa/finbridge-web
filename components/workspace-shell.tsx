'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { Button, ErrorNotice, fieldStyle, Pending, secondaryAction } from './ui';
import { getWorkspace, signOut, type Workspace } from '@/lib/api/client';
import { changeIdentity, sessionQuery, workspacesQuery } from '@/lib/queries';

const CurrentWorkspace = createContext<{ workspace: Workspace; actorId: string } | null>(null);
export const roleLabels = { OWNER: 'Owner', OPERATOR: 'Finance operator', VIEWER: 'Read-only advisor' };

export function useWorkspace() {
  const context = useContext(CurrentWorkspace);
  if (!context) throw new Error('Workspace context is unavailable');
  return context.workspace;
}

export function useWorkspaceKey(...suffix: unknown[]) {
  const context = useContext(CurrentWorkspace);
  if (!context) throw new Error('Workspace context is unavailable');
  return ['workspace', context.actorId, context.workspace.id, ...suffix];
}

export function WorkspaceShell({ slug, children }: { slug: string; children: ReactNode }) {
  const client = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const session = useQuery(sessionQuery);
  const options = useQuery({ ...workspacesQuery, enabled: !!session.data });
  const selected = options.data?.find((item) => item.slug === slug);
  const current = useQuery({
    queryKey: ['workspace', session.data?.id, selected?.id, 'membership'],
    queryFn: ({ signal }) => getWorkspace(selected!.id, signal),
    enabled: !!selected,
    staleTime: 0,
  });

  const actorId = session.data?.id;
  const workspaceId = selected?.id;
  useEffect(() => {
    if (!actorId || !workspaceId) return;
    const queryKey = ['workspace', actorId, workspaceId];
    return () => {
      queueMicrotask(() => client.removeQueries({ queryKey, type: 'inactive' }));
    };
  }, [actorId, workspaceId, client]);

  const logout = useMutation({
    mutationFn: signOut,
    onSuccess: async () => {
      await changeIdentity(client, null);
      router.replace('/onboarding');
    },
  });

  async function changeWorkspace(nextSlug: string) {
    dialog.current?.close();
    await client.cancelQueries({ queryKey: ['workspace'] });
    client.removeQueries({ queryKey: ['workspace'] });
    router.push(`/w/${nextSlug}/overview`);
  }

  if (!current.data || session.data === null || current.isError || options.isError || session.isError) {
    const waiting = session.isPending || (!!session.data && (options.isPending || (!!selected && current.isPending)));
    const error = session.error ?? options.error ?? current.error;
    return (
      <main id="main" tabIndex={-1} className="mx-auto max-w-[640px] space-y-4 p-4">
        {waiting && <Pending>Loading workspace…</Pending>}
        {error && <ErrorNotice error={error} />}
        {!waiting && !error && <h1 className="text-title font-semibold">Workspace unavailable</h1>}
        {!waiting && <Link className={secondaryAction} href="/onboarding">Go to workspaces</Link>}
      </main>
    );
  }

  const workspace = current.data;
  const routes = [['overview', 'Overview'], ['invoices', 'Invoices'], ['expenses', 'Expenses']];
  if (workspace.role === 'OWNER') routes.push(['settings/members', 'Members']);
  const nav = (name: string) => (
    <>
      <div>
        <p className="text-label font-semibold text-action">FinBridge OS</p>
        <p className="mt-2 break-words font-semibold">{workspace.displayName}</p>
        <p className="text-label text-muted">{roleLabels[workspace.role]}</p>
      </div>
      <div className="space-y-1">
        <label htmlFor={`switch-${name}`} className="block text-label font-medium">Workspace</label>
        <select id={`switch-${name}`} className={fieldStyle} value={slug} onChange={(event) => void changeWorkspace(event.target.value)}>
          {options.data?.map((item) => <option key={item.id} value={item.slug}>{item.displayName}</option>)}
        </select>
      </div>
      <nav aria-label="Workspace navigation" className="space-y-1">
        {routes.map(([route, label]) => {
          const href = `/w/${slug}/${route}`;
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link key={route} href={href} aria-current={active ? 'page' : undefined} onClick={() => dialog.current?.close()}
              className={`flex min-h-11 items-center rounded-[var(--radius-control)] px-3 py-2 ${active ? 'border-l-4 border-action bg-canvas font-semibold' : 'hover:bg-canvas'}`}>
              {label}
            </Link>
          );
        })}
      </nav>
      <Link className={secondaryAction} href="/onboarding">All workspaces</Link>
      <ErrorNotice error={logout.error} />
      <Button secondary className="w-full" disabled={logout.isPending} onClick={() => logout.mutate()}>Sign out</Button>
    </>
  );

  return (
    <CurrentWorkspace.Provider value={{ workspace, actorId: session.data!.id }}>
      <div className="min-h-screen min-[1200px]:grid min-[1200px]:grid-cols-[232px_minmax(0,1fr)] print:block print:min-h-0">
        <aside className="hidden space-y-6 border-r border-divider bg-surface px-4 py-6 min-[1200px]:block print:hidden">{nav('desktop')}</aside>
        <header className="flex min-w-0 items-center justify-between gap-3 border-b border-divider bg-surface px-4 py-2 min-[768px]:px-6 min-[1200px]:hidden print:hidden">
          <div className="min-w-0">
            <p className="break-words font-semibold">{workspace.displayName}</p>
            <p className="text-label text-muted">{roleLabels[workspace.role]}</p>
          </div>
          <button ref={menuTrigger} type="button" className={secondaryAction} onClick={() => dialog.current?.showModal()} aria-haspopup="dialog">
            Workspace menu
          </button>
        </header>
        <dialog ref={dialog} onClose={() => menuTrigger.current?.focus()} aria-labelledby="workspace-menu"
          className="fixed inset-y-0 m-0 h-full max-h-none w-[min(20rem,100%)] max-w-none space-y-4 overflow-y-auto border-r border-divider bg-surface p-4 text-ink shadow-[var(--shadow-overlay)] backdrop:bg-slate-950/35">
          <h2 id="workspace-menu" className="text-section font-semibold">Workspace menu</h2>
          <Button secondary onClick={() => dialog.current?.close()}>Close menu</Button>
          {nav('mobile')}
        </dialog>
        <main id="main" tabIndex={-1} className="min-w-0 px-4 py-6 min-[768px]:px-6 min-[1200px]:px-8 min-[1200px]:py-8 print:p-0">
          {children}
        </main>
      </div>
    </CurrentWorkspace.Provider>
  );
}
