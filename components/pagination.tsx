'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { secondaryAction } from './ui';

export function useListNavigation() {
  const path = usePathname();
  const current = useSearchParams();
  function href(changes: Record<string, string | null>) {
    const parameters = new URLSearchParams(current);
    for (const [name, value] of Object.entries(changes)) {
      if (value) parameters.set(name, value);
      else parameters.delete(name);
    }
    return `${path}${parameters.size ? '?' + parameters.toString() : ''}`;
  }
  return { parameters: current, href };
}

export function Pagination({ nextCursor, previousCursor }: { nextCursor: string | null; previousCursor: string | null }) {
  const { href } = useListNavigation();
  if (!nextCursor && !previousCursor) return null;
  return (
    <nav aria-label="Pagination" className="flex flex-wrap gap-2">
      {previousCursor && <Link className={secondaryAction} href={href({ before: previousCursor, after: null })}>Previous</Link>}
      {nextCursor && <Link className={secondaryAction} href={href({ after: nextCursor, before: null })}>Next</Link>}
    </nav>
  );
}
