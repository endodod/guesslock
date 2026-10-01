// Cache invalidation for frozen puzzles (see getPuzzle in puzzles.ts).
import { revalidateTag } from "next/cache";

export const PUZZLES_TAG = "puzzles";

/**
 * Call after writing DailyPuzzle rows. Works in route handlers and server actions; elsewhere (CLI scripts) there is no
 * Next.js cache to clear, and the 60 s lifetime of the cached rows covers it.
 */
export function puzzlesChanged(): void {
  try {
    revalidateTag(PUZZLES_TAG, { expire: 0 });
  } catch {
    /* not inside a Next.js request: nothing cached here */
  }
}
