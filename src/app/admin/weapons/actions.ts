"use server";
// Weapon groups: which weapon types share a family in The Reckoning's Weapon column (Setting "weapon-groups").
import { revalidatePath, updateTag } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/auth";
import { WEAPON_GROUPS_KEY, weaponKey, type WeaponGroups } from "@/lib/engine/columns";

function done() {
  updateTag("catalog");
  revalidatePath("/admin", "layout");
}

/** Inputs "g|<weapon type>" = family (empty: the type stands for itself), plus "newType"/"newFamily" for one more row. */
export async function saveWeaponGroups(form: FormData) {
  await requireAdmin();
  const groups: WeaponGroups = {};
  for (const [k, v] of form.entries()) {
    if (!k.startsWith("g|")) continue;
    const type = weaponKey(k.slice(2)), fam = String(v).trim();
    if (type && fam) groups[type] = fam;
  }
  const extraType = weaponKey(String(form.get("newType") ?? "")), extraFam = String(form.get("newFamily") ?? "").trim();
  if (extraType && extraFam) groups[extraType] = extraFam;
  if (!Object.keys(groups).length) throw new Error("Give at least one weapon type a family (or reset to the defaults).");
  await db.setting.upsert({ where: { key: WEAPON_GROUPS_KEY }, create: { key: WEAPON_GROUPS_KEY, value: groups }, update: { value: groups } });
  done();
}

/** Back to the built-in table (engine/columns.ts). */
export async function resetWeaponGroups(): Promise<string> {
  await requireAdmin();
  await db.setting.deleteMany({ where: { key: WEAPON_GROUPS_KEY } });
  done();
  return "Back to the default groups.";
}
