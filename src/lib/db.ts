import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * pg warns about the 'prefer', 'require' and 'verify-ca' SSL modes because they are already treated as 'verify-full'.
 * Spelling out the mode it uses anyway keeps the behaviour and silences the warning.
 */
export function explicitSsl(url: string | undefined): string | undefined {
  if (!url || /uselibpqcompat=/.test(url)) return url;
  return url.replace(/([?&]sslmode=)(prefer|require|verify-ca)(?=&|$)/, "$1verify-full");
}

function create() {
  const adapter = new PrismaPg({ connectionString: explicitSsl(process.env.DATABASE_URL) });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? create();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
