import { Suspense } from 'react';
import { Pending } from '@/components/ui';
import { ImportStatement } from './screen';

export default function ImportPage() {
  return <Suspense fallback={<Pending>Loading statement import…</Pending>}><ImportStatement /></Suspense>;
}
