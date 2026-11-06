import { Suspense } from 'react';
import { Pending } from '@/components/ui';
import { ReadinessScreen } from './screen';

export default function ReadinessPage() {
  return <Suspense fallback={<Pending>Loading readiness…</Pending>}><ReadinessScreen /></Suspense>;
}
