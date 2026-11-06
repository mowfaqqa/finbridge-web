'use client';

import { useRef } from 'react';

export function useCommandKey() {
  const current = useRef<{ fingerprint: string; key: string } | null>(null);
  return {
    for(input: unknown) {
      const fingerprint = JSON.stringify(input);
      if (current.current?.fingerprint !== fingerprint) {
        current.current = { fingerprint, key: crypto.randomUUID() };
      }
      return current.current.key;
    },
    reset() {
      current.current = null;
    },
  };
}
