import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations use the direct (non-pooled) Neon connection when available.
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
