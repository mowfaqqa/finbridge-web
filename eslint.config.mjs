import { defineConfig, globalIgnores } from 'eslint/config';
import coreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

export default defineConfig([
  ...coreWebVitals,
  ...nextTypeScript,
  globalIgnores(['.next/**', 'out/**', 'next-env.d.ts']),
]);
