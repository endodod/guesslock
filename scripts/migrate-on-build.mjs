// Applies pending database migrations during the build on Vercel (or anywhere with MIGRATE_ON_BUILD=1),
// so a deploy never runs new code against an old schema. Skipped without a database URL.
import { execSync } from "node:child_process";

const wanted = process.env.VERCEL === "1" || process.env.MIGRATE_ON_BUILD === "1";
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!wanted) console.log("[migrate] skipped (not on Vercel; set MIGRATE_ON_BUILD=1 to run here)");
else if (!url) console.log("[migrate] skipped: no DATABASE_URL/DIRECT_URL");
else execSync("npx prisma migrate deploy", { stdio: "inherit" });
