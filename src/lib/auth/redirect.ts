/**
 * A same-site relative path from user input (a `next` parameter), or "/". Browsers treat a backslash like a slash, so
 * "/\evil.example" and "//evil.example" both leave the site; control characters can split a header. Both are refused.
 */
export function safeNextPath(next: string | null | undefined, refuse: string[] = []): string {
  const n = (next ?? "").trim();
  if (!n.startsWith("/") || n.startsWith("//") || /[\u0000-\u001f\u007f\\]/.test(n)) return "/";
  return refuse.some((p) => n === p || n.startsWith(`${p}/`) || n.startsWith(`${p}?`)) ? "/" : n;
}
