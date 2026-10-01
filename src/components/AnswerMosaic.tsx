// A solution that is a group (a team, a hero grid, a sorting table): its pictures as one tidy mosaic.
/* eslint-disable @next/next/no-img-element */

/** Columns that fit n pictures without leaving a hole. `portrait` frames (the tall Vault tile) get fewer columns, so cells stay square. */
function columnsFor(n: number, portrait: boolean): number {
  if (portrait) return n <= 2 ? 1 : n <= 6 ? 2 : n <= 12 ? 3 : 4;
  if (n <= 1) return 1;
  if (n <= 4) return 2;
  if (n <= 9) return 3;
  return 4;
}

/** How many pictures a mosaic of this size shows (a whole number of rows: no half-empty last row). */
export function mosaicCount(n: number, portrait = false): number {
  const cols = columnsFor(n, portrait);
  if (n <= cols) return n;
  return Math.floor(n / cols) * cols;
}

export function AnswerMosaic({ images, className = "", label, portrait = false }: { images: string[]; className?: string; label?: string; portrait?: boolean }) {
  const shown = images.slice(0, mosaicCount(Math.min(images.length, 16), portrait));
  const cols = columnsFor(shown.length, portrait);
  const rows = Math.ceil(shown.length / cols);
  const grid = (
    <div
      className={`grid ${portrait ? "w-full" : "h-full w-full"} ${className}`}
      // Portrait: the mosaic keeps square cells and is centred in the frame instead of being stretched into slivers.
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: portrait ? undefined : `repeat(${rows}, minmax(0, 1fr))`, aspectRatio: portrait ? `${cols} / ${rows}` : undefined }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {shown.map((u, i) => <img key={i} src={u} alt="" loading="lazy" className="aspect-square h-full w-full object-cover object-top" />)}
    </div>
  );
  return portrait ? <div className="flex h-full w-full items-center justify-center overflow-hidden">{grid}</div> : grid;
}
