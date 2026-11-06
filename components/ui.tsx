import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { ApiError } from '@/lib/api/client';

export const primaryAction = 'inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-action px-4 py-2 font-medium text-on-action transition-colors duration-[var(--feedback-duration)] hover:bg-action-hover active:bg-action-pressed disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-fg)]';
export const secondaryAction = 'inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-control bg-surface px-4 py-2 font-medium text-ink transition-colors duration-[var(--feedback-duration)] hover:bg-canvas disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-fg)]';
export const fieldStyle = 'min-h-11 w-full rounded-[var(--radius-control)] border border-control bg-surface px-3 py-2 text-ink aria-invalid:border-[var(--danger-fg)]';
export const panelStyle = 'rounded-[var(--radius-panel)] border border-divider bg-surface p-4 sm:p-6';

export function Button({ className = '', secondary = false, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { secondary?: boolean }) {
  return <button {...props} type={type} className={`${secondary ? secondaryAction : primaryAction} ${className}`} />;
}

export function Field({ id, label, hint, error, ...props }: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  hint?: string;
  error?: string;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-label font-medium">{label}</label>
      {hint && <p id={`${id}-hint`} className="text-label text-muted">{hint}</p>}
      <input {...props} id={id} className={fieldStyle} aria-invalid={!!error}
        aria-describedby={[hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined} />
      {error && <p id={`${id}-error`} className="text-label text-[var(--danger-fg)]">{error}</p>}
    </div>
  );
}

export function ErrorNotice({ error, retry, fieldLinks }: {
  error: unknown;
  retry?: () => void;
  fieldLinks?: Record<string, string>;
}) {
  if (!error) return null;
  const problem = error instanceof ApiError ? error : undefined;
  const issues = Object.entries(problem?.fields ?? {});
  return (
    <div role="alert" className="space-y-2 rounded-[var(--radius-control)] bg-[var(--danger-bg)] p-3 text-[var(--danger-fg)]">
      <p className="font-medium">{problem?.message ?? 'We could not complete the request. Try again.'}</p>
      {issues.length > 0 && (
        <ul className="ml-5 list-disc text-label">
          {issues.map(([field, messages]) => <li key={field}>{fieldLinks?.[field] ? <a className="underline" href={`#${fieldLinks[field]}`}>{messages.join(' ')}</a> : messages.join(' ')}</li>)}
        </ul>
      )}
      {problem?.requestId && <p className="break-all text-meta">Reference {problem.requestId}</p>}
      {retry && <Button secondary onClick={retry}>Try again</Button>}
    </div>
  );
}

export function Pending({ children }: { children: ReactNode }) {
  return <p role="status" className="rounded-[var(--radius-control)] bg-[var(--loading-bg)] p-3 text-[var(--info-fg)]">{children}</p>;
}

const badgeTones = {
  info: 'bg-[var(--info-bg)] text-[var(--info-fg)]',
  success: 'bg-[var(--success-bg)] text-[var(--success-fg)]',
  warning: 'bg-[var(--warning-bg)] text-[var(--warning-fg)]',
  danger: 'bg-[var(--danger-bg)] text-[var(--danger-fg)]',
  neutral: 'bg-canvas text-muted',
};

export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return <span className={`inline-flex rounded-full px-2 py-1 text-meta font-medium ${badgeTones[tone]}`}>{children}</span>;
}
