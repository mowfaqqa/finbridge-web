import { Suspense } from 'react';
import { Pending } from '@/components/ui';
import { Invoices } from './screen';

export default function InvoicesPage() {
  return <Suspense fallback={<Pending>Loading invoices…</Pending>}><Invoices /></Suspense>;
}
