// Shared image sizing rules (plain module: usable from server and client components).
/**
 * Image classes for an answer picture. Hero portraits fill their frame, cropped from the top so
 * the face stays in view; item and ability icons are shown whole, never enlarged past their frame.
 */
export function answerImageClass(kind: "hero" | "ability" | "item" | "number" | "omen"): string {
  return kind === "hero" ? "h-full w-full object-cover object-top" : "h-full w-full object-contain p-[14%]";
}
