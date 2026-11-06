import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'FinBridge OS', template: '%s | FinBridge OS' },
  description: 'Financial operations and financing readiness for SMEs.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-NG">
      <body className="min-h-screen text-body antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:bg-surface focus:p-3">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
