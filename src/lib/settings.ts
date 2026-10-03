// Admin settings (table "Setting"). Reads never fail a page: until the migration that creates the table has run
// (e.g. a local dev server on a database that is behind), a setting reads as unset and the defaults apply.
import { db } from "./db";

/** Prisma's "table does not exist". */
const isMissingTable = (e: unknown) => (e as { code?: string })?.code === "P2021";

export async function readSetting(key: string): Promise<{ value: unknown; updatedAt: Date } | null> {
  try {
    return await db.setting.findUnique({ where: { key } });
  } catch (e) {
    if (isMissingTable(e)) return null;
    throw e;
  }
}

/** False when the Setting table is not there yet (pending migration): saving would fail. */
export async function settingsReady(): Promise<boolean> {
  try {
    await db.setting.findFirst({ select: { key: true } });
    return true;
  } catch (e) {
    if (isMissingTable(e)) return false;
    throw e;
  }
}
