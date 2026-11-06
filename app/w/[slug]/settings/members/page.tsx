'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { Button, ErrorNotice, Field, fieldStyle, panelStyle, Pending } from '@/components/ui';
import { roleLabels, useWorkspace } from '@/components/workspace-shell';
import { api, authOptions, inviteMember, listMembers, type InvitationInput, type Member } from '@/lib/api/client';
import { sessionQuery, workspacesQuery } from '@/lib/queries';
import { useCommandKey } from '@/lib/use-command-key';

type Change = { kind: 'revoke' | 'transfer' | 'role'; member: Member };
const actionLabels = { revoke: 'Remove access', transfer: 'Transfer ownership', role: 'Change role' };

export default function Members() {
  const workspace = useWorkspace();
  const client = useQueryClient();
  const router = useRouter();
  const session = useQuery(sessionQuery);
  const options = useQuery({ queryKey: ['auth-options'], queryFn: ({ signal }) => authOptions(signal) });
  const queryKey = ['workspace', session.data?.id, workspace.id, 'members'];
  const members = useQuery({
    queryKey, queryFn: ({ signal }) => listMembers(workspace.id, signal), enabled: workspace.role === 'OWNER',
  });
  const inviteKey = useCommandKey();
  const changeKey = useCommandKey();
  const dialog = useRef<HTMLDialogElement>(null);
  const [change, setChange] = useState<Change | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const invite = useMutation({
    mutationFn: (input: InvitationInput) => inviteMember(workspace.id, input, inviteKey.for(input)),
    onSuccess: ({ token }) => {
      inviteKey.reset();
      setLink(`${window.location.origin}/invitations/accept#token=${encodeURIComponent(token)}`);
    },
  });

  const save = useMutation({
    mutationFn: (input: { change: Change; role?: string; reason?: string }) => {
      const { kind, member } = input.change;
      const root = `/workspaces/${workspace.id}`;
      const base = `${root}/members/${member.userId}`;
      const key = changeKey.for(input);
      if (kind === 'role') {
        return api(`${base}`, { method: 'PATCH', body: { role: input.role, version: member.version }, key });
      }
      if (kind === 'revoke') {
        return api(`${base}/revoke`, { method: 'POST', body: { reason: input.reason, version: member.version }, key });
      }
      return api(`${root}/transfer-ownership`, {
        method: 'POST', body: { userId: member.userId, version: workspace.version }, key,
      });
    },
    onSuccess: async (_response, input) => {
      changeKey.reset();
      dialog.current?.close();
      setChange(null);
      if (input.change.kind === 'transfer') {
        router.replace(`/w/${workspace.slug}/overview`);
        await client.invalidateQueries({ queryKey: ['workspace', session.data?.id, workspace.id] });
        await client.invalidateQueries({ queryKey: workspacesQuery.queryKey });
      } else {
        await client.invalidateQueries({ queryKey });
      }
    },
  });

  function open(kind: Change['kind'], member: Member) {
    save.reset();
    changeKey.reset();
    setChange({ kind, member });
    dialog.current?.showModal();
  }

  function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLink(null);
    invite.mutate({ email: String(form.get('email') ?? ''), role: form.get('role') as InvitationInput['role'] });
  }

  if (workspace.role !== 'OWNER') {
    return <div className={panelStyle}><h1 className="text-title font-semibold">Members</h1><p>Only workspace owners can manage membership.</p></div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-title font-semibold">Members</h1>
      {options.data?.invitationsEnabled && (
        <section className={`${panelStyle} max-w-[640px] space-y-4`} aria-labelledby="invite-heading">
          <h2 id="invite-heading" className="text-section font-semibold">Invite a member</h2>
          <p className="text-muted">The link expires in 72 hours and requires the invited identity’s verified email address.</p>
          <ErrorNotice error={invite.error} fieldLinks={{ email: 'invite-email', role: 'invite-role' }} />
          <form onSubmit={submitInvite} className="space-y-4">
            <Field id="invite-email" name="email" type="email" label="Verified email address" required maxLength={254} />
            <div className="space-y-1">
              <label htmlFor="invite-role" className="block text-label font-medium">Workspace role</label>
              <select id="invite-role" name="role" className={fieldStyle}>
                <option value="OPERATOR">Finance operator</option>
                <option value="VIEWER">Read-only advisor</option>
              </select>
            </div>
            <Button type="submit" disabled={invite.isPending}>{invite.isPending ? 'Creating invitation…' : 'Create invitation'}</Button>
          </form>
          {link && <div role="status"><Field id="invite-link" label="Invitation link" value={link} readOnly
            hint="Copy this link and share it with the intended recipient." onFocus={(event) => event.currentTarget.select()} /></div>}
        </section>
      )}
      <section className={panelStyle} aria-labelledby="active-members">
        <h2 id="active-members" className="text-section font-semibold">Active members</h2>
        {members.isPending && <Pending>Loading members…</Pending>}
        <ErrorNotice error={members.error} retry={() => void members.refetch()} />
        <ul className="divide-y divide-divider">
          {members.data?.map((member) => (
            <li key={member.userId} className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div className="min-w-0">
                <p className="break-all font-medium">{member.verifiedEmail ?? 'Member'}</p>
                <p className="text-label text-muted">{roleLabels[member.role]}</p>
              </div>
              {member.role !== 'OWNER' && (
                <div className="flex flex-wrap gap-2">
                  <Button secondary onClick={() => open('role', member)}>Change role</Button>
                  <Button secondary onClick={() => open('transfer', member)}>Transfer ownership</Button>
                  <Button secondary onClick={() => open('revoke', member)}>Remove access</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
      <dialog ref={dialog} aria-labelledby="member-action" onClose={() => setChange(null)}
        className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-[420px] rounded-[var(--radius-panel)] border border-divider bg-surface p-6 text-ink shadow-[var(--shadow-overlay)] backdrop:bg-slate-950/35">
        {change && (
          <form className="space-y-4" onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            save.mutate({ change, role: String(form.get('role') ?? ''), reason: String(form.get('reason') ?? '') });
          }}>
            <h2 id="member-action" className="text-section font-semibold">{actionLabels[change.kind]}</h2>
            <p className="break-all">{change.member.verifiedEmail ?? 'Selected member'}</p>
            {change.kind === 'transfer' && <p>This member becomes the owner. Your role changes to finance operator.</p>}
            {change.kind === 'role' && <div className="space-y-1">
              <label htmlFor="new-role" className="block text-label font-medium">New role</label>
              <select id="new-role" name="role" className={fieldStyle} defaultValue={change.member.role}>
                <option value="OPERATOR">Finance operator</option>
                <option value="VIEWER">Read-only advisor</option>
              </select>
            </div>}
            {change.kind === 'revoke' && <Field id="reason" name="reason" label="Reason for removing access" required maxLength={250} />}
            <ErrorNotice error={save.error} />
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : actionLabels[change.kind]}</Button>
              <Button secondary onClick={() => dialog.current?.close()} disabled={save.isPending}>Cancel</Button>
            </div>
          </form>
        )}
      </dialog>
    </div>
  );
}
