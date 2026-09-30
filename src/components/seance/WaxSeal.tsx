// Small wax seal, one per Séance table: intact while unfinished, broken when finished
// (ecto when won, velvet when lost), grey when the table is sealed for the day.
export type SealState = "intact" | "won" | "lost" | "sealed";

const FILL: Record<SealState, [string, string]> = {
  intact: ["#c24a44", "#6e1d1a"],
  won: ["#9ff0d4", "#2f8f72"],
  lost: ["#6b2a2f", "#2a1013"],
  sealed: ["#6f6860", "#34302b"],
};

export function WaxSeal({ state, className = "h-6 w-6", title }: { state: SealState; className?: string; title?: string }) {
  const [a, b] = FILL[state];
  const id = `wax-${state}`;
  const broken = state === "won" || state === "lost";
  return (
    <svg viewBox="0 0 24 24" className={className} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs>
        <radialGradient id={id} cx="35%" cy="35%" r="70%">
          <stop offset="0%" stopColor={a} />
          <stop offset="100%" stopColor={b} />
        </radialGradient>
      </defs>
      {/* blobby wax rim */}
      <path d="M12 1.8l2.2 1.4 2.6-.3 1.3 2.3 2.4 1.1-.2 2.6 1.6 2.1-1.6 2.1.2 2.6-2.4 1.1-1.3 2.3-2.6-.3L12 22.2l-2.2-1.4-2.6.3-1.3-2.3-2.4-1.1.2-2.6L2.1 13l1.6-2.1-.2-2.6 2.4-1.1 1.3-2.3 2.6.3z" fill={`url(#${id})`} />
      <circle cx="12" cy="12" r="5.6" fill="none" stroke="rgb(0 0 0 / 0.28)" strokeWidth="1" />
      {state === "sealed" && <path d="M9 9l6 6M15 9l-6 6" stroke="rgb(0 0 0 / 0.35)" strokeWidth="1.4" strokeLinecap="round" />}
      {broken && <path d="M12 2.5l-1.2 5 2 2.2-1.6 3.4 1.4 2.4-1 6" fill="none" stroke="#0e0d0b" strokeWidth="1.3" strokeLinejoin="round" />}
    </svg>
  );
}
