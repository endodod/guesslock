"use server";
// Community puzzles: hide a reported puzzle, or restore it (which clears its reports).
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { setCommunityStatus } from "@/lib/community/service";

export async function setPuzzleStatus(id: string, status: "live" | "hidden"): Promise<string> {
  await requireAdmin();
  await setCommunityStatus(id, status);
  revalidatePath("/admin/community");
  return status === "live" ? "Restored." : "Hidden.";
}
