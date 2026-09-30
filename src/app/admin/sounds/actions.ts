"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/auth";
import { approveClip, importSounds, measurePending, updateClip } from "@/lib/sounds/import";
import { SOUND_ROLES, type SoundRole } from "@/lib/sounds/match";

const folders = (v: FormDataEntryValue | null) =>
  [...new Set(String(v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => /^[a-z0-9_-]+$/.test(s)))];

export async function runSoundImport() {
  await requireAdmin();
  const r = await importSounds();
  revalidatePath("/admin/sounds");
  return `${r.clips} clips (${r.added} new, ${r.updated} updated, ${r.missing} gone)${r.unmappedHeroes.length ? `; no folder: ${r.unmappedHeroes.join(", ")}` : ""}`;
}

/** Measure suggested clips (all heroes, or one) for up to ~50 s. */
export async function runMeasure(heroId?: number) {
  await requireAdmin();
  const r = await measurePending(Date.now() + 50_000, { heroId });
  revalidatePath("/admin/sounds");
  return `${r.measured} measured, ${r.failed} failed, ${r.left} left`;
}

export async function saveSoundMap(heroId: number, form: FormData) {
  await requireAdmin();
  const data = { abilityFolders: folders(form.get("abilityFolders")), weaponFolders: folders(form.get("weaponFolders")) };
  const auto = form.get("auto") === "on";
  await db.heroSoundMap.upsert({
    where: { heroId },
    create: { heroId, ...data, source: auto ? "auto" : "manual" },
    update: { ...data, source: auto ? "auto" : "manual" },
  });
  // Pick up clips from the new folders right away (manual rows are kept).
  await importSounds();
  revalidatePath("/admin/sounds");
}

export async function approveSound(id: number) {
  await requireAdmin();
  await approveClip(id);
}

export async function setSound(id: number, patch: { status?: "suggested" | "excluded"; role?: string; abilityId?: number | null; preferred?: boolean }) {
  await requireAdmin();
  if (patch.role && !SOUND_ROLES.includes(patch.role as SoundRole)) throw new Error("bad role");
  await updateClip(id, { ...patch, role: patch.role as SoundRole | undefined });
}
