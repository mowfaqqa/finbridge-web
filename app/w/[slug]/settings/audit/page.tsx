import { Suspense } from 'react';
import { Pending } from '@/components/ui';
import { AuditHistory } from './screen';

export default function AuditHistoryPage() {
  return <Suspense fallback={<Pending>Loading audit history…</Pending>}><AuditHistory /></Suspense>;
}
