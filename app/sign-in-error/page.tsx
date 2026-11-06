import Link from 'next/link';
import { panelStyle, primaryAction } from '@/components/ui';

export default function SignInError() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-[672px] space-y-6 px-4 py-8 sm:px-6 sm:py-12">
      <div className={`${panelStyle} space-y-4`}>
        <p className="text-label font-semibold text-action">FinBridge OS</p>
        <h1 className="text-title font-semibold">Unable to sign in</h1>
        <p className="text-muted">Start a new sign-in attempt. If you were accepting an invitation, reopen the invitation link.</p>
        <Link href="/onboarding" className={primaryAction}>Go to sign in</Link>
      </div>
    </main>
  );
}
