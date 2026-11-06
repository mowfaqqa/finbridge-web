# FinBridge OS Web

Standalone Next.js frontend for the FinBridge OS SME workspace. Browser API calls use the app origin under `/api/v1`. Next.js forwards them to the NestJS API without exposing a second origin to the browser.

Use Node.js 22 and pnpm 10. Copy `.env.example` to `.env.local`, then run `pnpm install --frozen-lockfile` and `pnpm dev`. Open http://localhost:3000. Run `pnpm lint` and `pnpm build` to verify the frontend.

The PRD's light theme is defined in `app/tokens.css`. Primary controls pair white with deep teal. Text and feedback tokens use the surface or the paired status background. IBM Plex Sans is served from the application.
