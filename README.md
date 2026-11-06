# FinBridge OS Web

Standalone Next.js frontend for the FinBridge OS SME workspace. Browser API calls use the app origin under `/api/v1`. Next.js forwards them to the NestJS API without exposing a second origin to the browser.

Use Node.js 22 and pnpm 10. Copy `.env.example` to `.env.local`, then run `pnpm install --frozen-lockfile` and `pnpm dev`. Open http://localhost:3000. Run `pnpm lint` and `pnpm build` to verify the frontend.

The PRD's light theme is defined in `app/tokens.css`. Primary controls pair white with deep teal. Text and feedback tokens use the surface or the paired status background. IBM Plex Sans is served from the application.

## Local onboarding

Start the API and apply its migrations first. Open http://localhost:3000, choose the SME owner identity and create a workspace. The workspace switcher lists active memberships and clears workspace queries when switching.

Regenerate `lib/api/contract.d.ts` with `pnpm api:generate` against the local API. You can also run `pnpm exec openapi-typescript path/to/openapi.json -o lib/api/contract.d.ts` against the exported contract from the backend repo.

If the backend enables managed OIDC, the sign-in screen also displays **Continue to sign in**. The callback uses this frontend origin and the same API proxy as authenticated workspace calls.
