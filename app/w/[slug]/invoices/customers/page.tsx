import { Suspense } from 'react';
import { Pending } from '@/components/ui';
import { Customers } from './screen';

export default function CustomersPage() {
  return <Suspense fallback={<Pending>Loading customers…</Pending>}><Customers /></Suspense>;
}
