'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { SignIn } from '@/components/sign-in';
import { Button, ErrorNotice, panelStyle, Pending, secondaryAction } from '@/components/ui';
import { acceptInvitation, signOut } from '@/lib/api/client';
import { changeIdentity, sessionQuery, workspacesQuery } from '@/lib/queries';
import { useCommandKey } from '@/lib/use-command-key';

function subscribe(listener: () => void) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

const serverToken = () => undefined;
const browserToken = () => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';

export default function AcceptInvitation() {
  const token = useSyncExternalStore(subscribe, browserToken, serverToken);
  const session = useQuery(sessionQuery);
  const client = useQueryClient();
  const router = useRouter();
  const command = useCommandKey();
  const accept = useMutation({
    mutationFn: (value: string) => acceptInvitation(value, command.for(value)),
    onSuccess: async (workspace) => {
      await client.invalidateQueries({ queryKey: workspacesQuery.queryKey });
      router.replace(`/w/${workspace.slug}/overview`);
    },
  });
  const logout = useMutation({
    mutationFn: signOut,
    onSuccess: async () => {
      await changeIdentity(client, null);
      command.reset();
      accept.reset();
    },
  });

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-[672px] space-y-6 px-4 py-8 sm:px-6 sm:py-12">
      <header>
        <p className="text-label font-semibold text-action">FinBridge OS</p>
        <h1 className="mt-2 text-title font-semibold">Accept workspace invitation</h1>
      </header>
      <section className={`${panelStyle} space-y-4`}>
        {(token === undefined || session.isPending) && <Pending>Checking invitation and session…</Pending>}
        <ErrorNotice error={session.error} retry={() => void session.refetch()} />
        {token === '' && <p>Open the latest invitation link from the workspace owner.</p>}
        {token && session.data === null && <SignIn />}
        {token && session.data && (
          <>
            <p>Signed in as <strong className="break-all">{session.data.verifiedEmail ?? 'an identity without a verified email'}</strong>.</p>
            <ErrorNotice error={accept.error ?? logout.error} />
            <div className="flex flex-wrap gap-3">
              <Button disabled={accept.isPending || logout.isPending} onClick={() => accept.mutate(token)}>
                {accept.isPending ? 'Accepting invitation…' : 'Accept invitation'}
              </Button>
              <Button secondary disabled={accept.isPending || logout.isPending} onClick={() => logout.mutate()}>Use a different identity</Button>
            </div>
          </>
        )}
      </section>
      <Link className={secondaryAction} href="/onboarding">Go to workspaces</Link>
    </main>
  );
}
