import { defineConfig } from "@neon/config/v1";

// Player accounts are self-hosted Better Auth (src/lib/auth/), so Neon's managed auth is no longer used. The old neon_auth
// schema is left in place: the migration 20261013090000_better_auth copied its users from there.
export default defineConfig({});
