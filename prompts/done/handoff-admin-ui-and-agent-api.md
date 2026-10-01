# Handoff: finish the admin page designs (§3a) and verify everything

> Completed 2026-10-01. Admin pages now use the shared visual kit, route reachability is covered, and the agent API is built and documented.

## Completed

- Admin shell, navigation, theme, status/login pages, and shared design pieces are complete.
- Agent API v1 is built, tested, documented, guarded by separate read/write bearer tokens, and audited.
- Remaining admin pages now use `PageHeader`, `Card`, `Stat`, and `Pill` where appropriate, including hero detail, Omens, puzzles, Séance, and setup workflows.
- The shared `Stat` component supports slate tones, and sound clip tables use their correct `rows` prop.
- Route reachability tooling is present in `scripts/check-routes.ts`.

## Verification

- `npx tsc --noEmit` passes.
- `npx eslint src scripts` passes.
- `npx vitest run` passes: 141 tests.
- `npx next build` passes and includes all admin and agent API routes.

## Owner configuration

- Add `NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET` to Vercel Production for sign-in.
- Add `AGENT_API_READ_TOKEN` and `AGENT_API_WRITE_TOKEN` to Vercel to enable the agent API.
- Never set `ADMIN_DEBUG` or `ENABLE_STYLEGUIDE` in production.

Never run migrations, syncs, or writes against the Neon database from a dev session unless the owner asks.