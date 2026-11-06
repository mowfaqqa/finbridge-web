'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { Button, ErrorNotice, fieldStyle, Pending, primaryAction } from './ui';
import { authOptions, localSignIn, type Persona } from '@/lib/api/client';
import { changeIdentity } from '@/lib/queries';

const personas: Array<[Persona, string]> = [
  ['owner', 'SME owner'],
  ['operator', 'Finance operator'],
  ['viewer', 'Read-only advisor'],
  ['second-owner', 'Second SME owner'],
];

export function SignIn() {
  const client = useQueryClient();
  const path = usePathname();
  const options = useQuery({ queryKey: ['auth-options'], queryFn: ({ signal }) => authOptions(signal) });
  const login = useMutation({
    mutationFn: localSignIn,
    onSuccess: async (actor) => {
      await changeIdentity(client, actor);
    },
  });

  if (options.isPending) return <Pending>Loading sign-in options…</Pending>;
  if (options.isError) return <ErrorNotice error={options.error} retry={() => void options.refetch()} />;
  const { managedSignIn, localSignIn: localEnabled } = options.data;
  if (!managedSignIn && !localEnabled) return <p>Sign-in is unavailable in this environment.</p>;

  const returnTo = path === '/invitations/accept' ? path : '/onboarding';
  const managedHref = `/api/v1/auth/oidc/start?${new URLSearchParams({ returnTo })}`;
  function preserveInvitation() {
    if (returnTo === '/invitations/accept' && window.location.hash) {
      window.sessionStorage.setItem('finbridge-invitation', window.location.hash);
    }
  }

  return (
    <div className="space-y-4">
      {managedSignIn && <a className={primaryAction} href={managedHref} onClick={preserveInvitation}>Continue to sign in</a>}
      {localEnabled && (
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
          <Button type="submit" secondary={managedSignIn} disabled={login.isPending}>{login.isPending ? 'Signing in…' : 'Sign in'}</Button>
        </form>
      )}
    </div>
  );
}
