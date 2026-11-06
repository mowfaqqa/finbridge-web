import { Suspense } from 'react';
import { Pending } from '@/components/ui';
import { Accounts } from './screen';

export default function AccountsPage() {
  return <Suspense fallback={<Pending>Loading accounts…</Pending>}><Accounts /></Suspense>;
}
