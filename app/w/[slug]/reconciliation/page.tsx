import { Suspense } from 'react';
import { Pending } from '@/components/ui';
import { Reconciliation } from './screen';

export default function ReconciliationPage() {
  return <Suspense fallback={<Pending>Loading statement lines…</Pending>}><Reconciliation /></Suspense>;
}
