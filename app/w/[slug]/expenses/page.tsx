import { Suspense } from 'react';
import { Pending } from '@/components/ui';
import { Expenses } from './screen';

export default function ExpensesPage() {
  return <Suspense fallback={<Pending>Loading expenses…</Pending>}><Expenses /></Suspense>;
}
