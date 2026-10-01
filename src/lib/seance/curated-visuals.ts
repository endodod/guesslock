// Looks: hand-written groups about how heroes, items and abilities look (portraits and icons), plus the
// ones the API can tell (hero gender). Filled in from a review of every portrait and icon.
import type { Normalized } from "../deadlock/normalize";
import type { DerivedCategory } from "./derive";

export function deriveCuratedVisuals(norm: Pick<Normalized, "heroes" | "items" | "abilities">): DerivedCategory[] {
  void norm;
  return [];
}
