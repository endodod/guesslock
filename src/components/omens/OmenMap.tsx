"use client";
// The Omen stage: SVG over the calibrated minimap. Map-relative coordinates (0..1) are drawn in a
// 1000x1000 viewBox. Zoom/pan via wheel, drag and pinch; "focus" zooms onto the action.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Team } from "@/lib/omens/types";
import { Icon } from "../ui";

export type MapHero = {
  key: number;
  team: Team;
  icon: string | null;
  label: string;
  pos: [number, number];
  trail: [number, number][];
  hp: number;
  maxHp: number;
  alive: boolean;
  respawnIn: number;
};

export type MapMarker =
  | { id: string; kind: "death"; pos: [number, number]; age: number }
  | { id: string; kind: "flash"; pos: [number, number]; team: Team; age: number; label: string };

type Props = {
  image: string | null;
  objectivePositions: Record<string, [number, number]>;
  objectives: { key: string; team: Team; alive: boolean }[];
  heroes: MapHero[];
  midboss: { alive: boolean; label?: string };
  markers?: MapMarker[];
  riftPos?: [number, number] | null;
  focus: [number, number];
  selected?: Set<number>;
  hovered?: number | null;
  onHover?: (key: number | null) => void;
  onToggle?: (key: number) => void;
  selectable?: boolean;
};

const S = 1000; // viewBox size
export const TEAM_COLOR: Record<Team, string> = { amber: "var(--amber)", sapphire: "var(--sapphire)" };

type View = { x: number; y: number; w: number };
const clampView = (v: View): View => {
  const w = Math.min(S, Math.max(160, v.w));
  return { w, x: Math.min(S - w, Math.max(0, v.x)), y: Math.min(S - w, Math.max(0, v.y)) };
};
const focusView = (f: [number, number], w = 420): View => clampView({ w, x: f[0] * S - w / 2, y: f[1] * S - w / 2 });

function Skull({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} aria-hidden>
      <path d="M-7 1a7 7 0 1 1 14 0v3h-3v3h-8v-3h-3z" fill="var(--paper)" />
      <circle cx="-3" cy="0" r="2" fill="var(--ink)" />
      <circle cx="3" cy="0" r="2" fill="var(--ink)" />
    </g>
  );
}

export function OmenMap({
  image, objectivePositions, objectives, heroes, midboss, markers = [], riftPos, focus,
  selected, hovered, onHover, onToggle, selectable,
}: Props) {
  const [view, setView] = useState<View>({ x: 0, y: 0, w: S });
  // Hero icon size (1 = default): smaller icons make a crowded fight readable.
  const [iconScale, setIconScale] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ view: View; dist?: number; start: { x: number; y: number }; moved: boolean } | null>(null);

  // Screen px -> viewBox units.
  const scale = () => view.w / (svgRef.current?.getBoundingClientRect().width || S);
  const toSvg = (cx: number, cy: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: view.x + ((cx - r.left) / r.width) * view.w, y: view.y + ((cy - r.top) / r.height) * view.w };
  };

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    setView((v) => {
      const w = Math.min(S, Math.max(160, v.w * factor));
      const px = cx ?? v.x + v.w / 2, py = cy ?? v.y + v.w / 2;
      return clampView({ w, x: px - ((px - v.x) / v.w) * w, y: py - ((py - v.y) / v.w) * w });
    });
  }, []);

  // Wheel zoom (non-passive so the page doesn't scroll while zooming the map).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toSvg(e.clientX, e.clientY);
      zoomAt(e.deltaY > 0 ? 1.15 : 1 / 1.15, p.x, p.y);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    drag.current = {
      view, start: { x: e.clientX, y: e.clientY }, moved: false,
      dist: pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : undefined,
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !drag.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const d = drag.current;
    if (pts.length === 2 && d.dist) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const w = d.view.w * (d.dist / dist);
      setView(clampView({ w, x: d.view.x + (d.view.w - w) / 2, y: d.view.y + (d.view.w - w) / 2 }));
      d.moved = true;
      return;
    }
    const dx = (e.clientX - d.start.x) * scale(), dy = (e.clientY - d.start.y) * scale();
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.moved) {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      setView(clampView({ ...d.view, x: d.view.x - dx, y: d.view.y - dy }));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (!pointers.current.size) setTimeout(() => (drag.current = null), 0);
  };
  const clickHero = (key: number) => {
    if (drag.current?.moved) return; // a pan, not a tap
    if (selectable) onToggle?.(key);
  };

  // Dead heroes stay where they fell, greyed out with a skull and their respawn timer.
  const heroXY = (h: MapHero): [number, number] => [h.pos[0] * S, h.pos[1] * S];

  const zoomLabel = Math.round((S / view.w) * 100);

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.w}`}
        className="block aspect-square w-full touch-none select-none rounded-[2px] bg-[#101a1c]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="img"
        aria-label="Map of the match at this moment"
      >
        <defs>
          {heroes.map((h) => (
            <clipPath key={h.key} id={`hc${h.key}`}><circle r="15" /></clipPath>
          ))}
        </defs>
        {image && <image href={image} x="0" y="0" width={S} height={S} preserveAspectRatio="xMidYMid meet" opacity="0.85" />}

        {/* Objectives: solid = standing, outline = destroyed */}
        {objectives.map((o) => {
          const p = objectivePositions[o.key];
          if (!p) return null;
          const big = o.key.endsWith("core") || o.key.endsWith("titan");
          const r = big ? 11 : 8;
          return (
            <g key={o.key} transform={`translate(${p[0] * S} ${p[1] * S}) rotate(45)`}>
              <rect x={-r} y={-r} width={r * 2} height={r * 2} fill={o.alive ? TEAM_COLOR[o.team] : "rgba(0,0,0,0.4)"} stroke={TEAM_COLOR[o.team]} strokeWidth={o.alive ? 1.5 : 2} strokeDasharray={o.alive ? undefined : "3 3"} />
            </g>
          );
        })}

        {/* Midboss */}
        <g transform={`translate(${S / 2} ${S / 2})`}>
          <circle r="17" fill={midboss.alive ? "rgba(140,107,216,0.55)" : "rgba(0,0,0,0.45)"} stroke="var(--cursed)" strokeWidth="2" strokeDasharray={midboss.alive ? undefined : "4 3"} />
          <path d="M-9 -4 L-13 -13 L-5 -8 M9 -4 L13 -13 L5 -8" stroke="var(--paper)" strokeWidth="2" fill="none" />
          <circle cx="-4" cy="1" r="2.2" fill="var(--paper)" />
          <circle cx="4" cy="1" r="2.2" fill="var(--paper)" />
          {midboss.label && <text y="32" textAnchor="middle" className="fill-paper font-mono" fontSize="13">{midboss.label}</text>}
        </g>

        {riftPos && (
          <g transform={`translate(${riftPos[0] * S} ${riftPos[1] * S})`} role="img" aria-label="Unstable Rift">
            <circle r="26" fill="rgba(127,227,194,0.14)" stroke="var(--ecto)" strokeWidth="2" strokeDasharray="5 4" />
            <circle r="15" fill="rgba(10,30,28,0.7)" stroke="var(--ecto)" strokeWidth="2.5" />
            <path d="M0 -9 a9 9 0 1 1 -9 9 a5 5 0 1 1 5 -5 a2 2 0 1 1 -2 2" stroke="var(--ecto)" strokeWidth="2" fill="none" strokeLinecap="round" />
            <text y="-34" textAnchor="middle" className="fill-ecto font-mono" fontSize="13" style={{ paintOrder: "stroke" }} stroke="var(--ink)" strokeWidth="3">Rift</text>
          </g>
        )}

        {/* Trails, then heroes on top */}
        {heroes.filter((h) => h.alive && h.trail.length).map((h) => {
          const pts = [...h.trail, h.pos];
          return pts.slice(1).map((p, i) => (
            <line
              key={`${h.key}-${i}`}
              x1={pts[i][0] * S} y1={pts[i][1] * S} x2={p[0] * S} y2={p[1] * S}
              stroke={TEAM_COLOR[h.team]} strokeWidth="4" strokeLinecap="round" opacity={0.12 + (i / pts.length) * 0.5}
            />
          ));
        })}

        {heroes.map((h) => {
          const [x, y] = heroXY(h);
          const pct = h.maxHp > 0 ? Math.max(0, Math.min(1, h.hp / h.maxHp)) : 0;
          const c = 2 * Math.PI * 19;
          const isSel = selected?.has(h.key);
          const isHover = hovered === h.key;
          return (
            <g
              key={h.key}
              transform={`translate(${x} ${y}) scale(${iconScale})`}
              onPointerEnter={() => onHover?.(h.key)}
              onPointerLeave={() => onHover?.(null)}
              onClick={() => clickHero(h.key)}
              className={selectable ? "cursor-pointer" : undefined}
              role={selectable ? "checkbox" : undefined}
              aria-checked={selectable ? !!isSel : undefined}
              aria-label={h.label}
              tabIndex={selectable ? 0 : undefined}
              onKeyDown={(e) => { if (selectable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onToggle?.(h.key); } }}
              opacity={h.alive ? 1 : 0.85}
            >
              {(isHover || isSel) && <circle r="27" fill="none" stroke={isSel ? "#e05a5a" : "var(--brass)"} strokeWidth="3" strokeDasharray={isSel ? "5 3" : undefined} />}
              <circle r="17" fill="var(--ink)" stroke={h.alive ? TEAM_COLOR[h.team] : "#7a7a7a"} strokeWidth="3" />
              {h.icon && (
                <image href={h.icon} x="-15" y="-15" width="30" height="30" clipPath={`url(#hc${h.key})`} preserveAspectRatio="xMidYMid slice" style={h.alive ? undefined : { filter: "grayscale(1)" }} />
              )}
              {h.alive ? (
                <circle r="19" fill="none" stroke={pct > 0.5 ? "#6fd08c" : pct > 0.25 ? "#e3c14f" : "#e05a5a"} strokeWidth="2.5" strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90)" />
              ) : (
                <>
                  <circle r="17" fill="rgba(12,8,8,0.6)" />
                  <circle r="19" fill="none" stroke="#c0474f" strokeWidth="2" strokeDasharray="3 3" />
                  <Skull x={0} y={-1} s={1.15} />
                  {h.respawnIn > 0 && (
                    <text y="34" textAnchor="middle" fontSize="14" className="fill-paper font-mono" style={{ paintOrder: "stroke" }} stroke="var(--ink)" strokeWidth="3">
                      {h.respawnIn}s
                    </text>
                  )}
                </>
              )}
              {isSel && <Skull x={16} y={-16} s={0.9} />}
            </g>
          );
        })}

        {markers.map((m) =>
          m.kind === "death" ? (
            <g key={m.id} opacity={Math.max(0.35, 1 - m.age / 8)}>
              <circle cx={m.pos[0] * S} cy={m.pos[1] * S} r={14 + Math.min(1, m.age) * 12} fill="none" stroke="#c0474f" strokeWidth="3" />
              <Skull x={m.pos[0] * S} y={m.pos[1] * S} s={1.3} />
            </g>
          ) : (
            <g key={m.id} opacity={Math.max(0, 1 - m.age / 3)}>
              <circle cx={m.pos[0] * S} cy={m.pos[1] * S} r={24 + m.age * 30} fill="none" stroke={TEAM_COLOR[m.team]} strokeWidth="5" />
              <text x={m.pos[0] * S} y={m.pos[1] * S - 34} textAnchor="middle" fontSize="15" className="font-mono" fill={TEAM_COLOR[m.team]}>{m.label}</text>
            </g>
          ),
        )}
      </svg>

      <div className="absolute right-2 top-2 flex flex-col gap-1">
        {[
          { label: "Zoom in", icon: "+", on: () => zoomAt(1 / 1.4) },
          { label: "Zoom out", icon: "−", on: () => zoomAt(1.4) },
        ].map((b) => (
          <button key={b.label} type="button" onClick={b.on} aria-label={b.label} className="flex h-9 w-9 items-center justify-center rounded-[3px] border border-brass/50 bg-ink/85 font-mono text-lg text-brass hover:border-brass">
            {b.icon}
          </button>
        ))}
      </div>
      <label className="absolute left-2 top-2 flex items-center gap-2 rounded-[3px] border border-brass/50 bg-ink/85 px-2 py-1.5 text-xs text-brass">
        Icons
        <input
          type="range" min={0.5} max={1.5} step={0.05} value={iconScale}
          onChange={(e) => setIconScale(Number(e.target.value))}
          aria-label="Hero icon size" className="w-20 accent-[var(--brass)]"
        />
      </label>
      <div className="absolute bottom-2 left-2 flex gap-1.5">
        <button type="button" onClick={() => setView(focusView(focus))} className="inline-flex h-9 items-center gap-1.5 rounded-[3px] border border-ecto/60 bg-ink/85 px-3 text-sm text-ecto hover:bg-ecto/15">
          <Icon name="arrow-right" className="h-4 w-4 -rotate-45" /> Focus on action
        </button>
        {view.w < S && (
          <button type="button" onClick={() => setView({ x: 0, y: 0, w: S })} className="inline-flex h-9 items-center rounded-[3px] border border-brass/50 bg-ink/85 px-3 text-sm text-brass">
            Full map
          </button>
        )}
      </div>
      <span className="pointer-events-none absolute bottom-3 right-3 font-mono text-[0.7rem] text-ash">{zoomLabel}%</span>
    </div>
  );
}
