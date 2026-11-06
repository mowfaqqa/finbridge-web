import { Suspense } from 'react';
import { Pending } from '@/components/ui';
import { Overview } from './screen';

export default function OverviewPage() {
  return <Suspense fallback={<Pending>Loading overview…</Pending>}><Overview /></Suspense>;
}
