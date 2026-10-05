// Duels: the rules of the three 1v1 games, pure and shared by server (which checks every move) and client (which draws the
// board and offers only legal moves). Seat 0 is the Amber Hand, seat 1 the Sapphire Flame. States are plain JSON.

export type Seat = 0 | 1;
export type Outcome = { winner: Seat } | { draw: true } | null;

export type GameId = "tictactoe" | "connect4" | "checkers";

export interface DuelGame<S, M> {
  id: GameId;
  name: string;
  /** Short Deadlock-flavoured blurb. */
  blurb: string;
  init(): S;
  /** A move as sent by the client, checked for shape only. */
  parseMove(raw: unknown): M | null;
  /** Plays `move` for `seat`: the next state and who moves next, or why it isn't allowed. */
  apply(state: S, seat: Seat, move: M): { state: S; next: Seat } | { error: string };
  /** The result once the game is over (`toMove` is the seat whose turn it is now). */
  outcome(state: S, toMove: Seat): Outcome;
  /** A win pays souls only after at least this many moves (quick resigns and throwaway games don't). */
  minMoves: number;
}

const other = (s: Seat): Seat => (s === 0 ? 1 : 0);

// ───────────── Tic-tac-toe: "Three Souls" ─────────────

export type TttState = { cells: (Seat | null)[] };
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

export const tictactoe: DuelGame<TttState, { cell: number }> = {
  id: "tictactoe", name: "Three Souls", blurb: "Tic-tac-toe: three urns in a row.",
  minMoves: 5,
  init: () => ({ cells: Array(9).fill(null) }),
  parseMove: (raw) => {
    const cell = (raw as { cell?: unknown })?.cell;
    return Number.isInteger(cell) && (cell as number) >= 0 && (cell as number) < 9 ? { cell: cell as number } : null;
  },
  apply(s, seat, { cell }) {
    if (s.cells[cell] !== null) return { error: "That square is taken." };
    const cells = [...s.cells];
    cells[cell] = seat;
    return { state: { cells }, next: other(seat) };
  },
  outcome(s) {
    for (const [a, b, c] of LINES) if (s.cells[a] !== null && s.cells[a] === s.cells[b] && s.cells[a] === s.cells[c]) return { winner: s.cells[a] as Seat };
    return s.cells.every((c) => c !== null) ? { draw: true } : null;
  },
};

// ───────────── Connect four: "Soul Wells" ─────────────

export const C4_COLS = 7;
export const C4_ROWS = 6;
/** Row-major, row 0 at the top. */
export type C4State = { grid: (Seat | null)[] };

export function c4Winner(grid: (Seat | null)[]): Seat | null {
  const at = (r: number, c: number) => (r >= 0 && r < C4_ROWS && c >= 0 && c < C4_COLS ? grid[r * C4_COLS + c] : null);
  for (let r = 0; r < C4_ROWS; r++) for (let c = 0; c < C4_COLS; c++) {
    const s = at(r, c);
    if (s === null) continue;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      if ([1, 2, 3].every((k) => at(r + dr * k, c + dc * k) === s)) return s;
    }
  }
  return null;
}

export const connect4: DuelGame<C4State, { col: number }> = {
  id: "connect4", name: "Soul Wells", blurb: "Connect four: drop souls into the wells, four in a line wins.",
  minMoves: 7,
  init: () => ({ grid: Array(C4_COLS * C4_ROWS).fill(null) }),
  parseMove: (raw) => {
    const col = (raw as { col?: unknown })?.col;
    return Number.isInteger(col) && (col as number) >= 0 && (col as number) < C4_COLS ? { col: col as number } : null;
  },
  apply(s, seat, { col }) {
    for (let r = C4_ROWS - 1; r >= 0; r--) {
      if (s.grid[r * C4_COLS + col] === null) {
        const grid = [...s.grid];
        grid[r * C4_COLS + col] = seat;
        return { state: { grid }, next: other(seat) };
      }
    }
    return { error: "That well is full." };
  },
  outcome(s) {
    const w = c4Winner(s.grid);
    if (w !== null) return { winner: w };
    return s.grid.every((c) => c !== null) ? { draw: true } : null;
  },
};

// ───────────── Checkers (English draughts): "Patron's Gambit" ─────────────

export type Piece = { s: Seat; k?: boolean };
/** 64 squares, row-major, row 0 at the top. Seat 0 starts at the bottom and moves up. `quiet`: moves since a capture or a man moved. */
export type CkState = { board: (Piece | null)[]; quiet: number };
/** A move: the squares the piece visits, from first to last (more than two for a multi-jump). */
export type CkMove = { path: number[] };

/** No capture and no man moved for this many moves (both sides): a draw. */
export const CK_QUIET_DRAW = 80;

const rc = (i: number) => [Math.floor(i / 8), i % 8] as const;
const sq = (r: number, c: number) => (r >= 0 && r < 8 && c >= 0 && c < 8 ? r * 8 + c : -1);
const dirsOf = (p: Piece) => (p.k ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : p.s === 0 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]);
const crowns = (p: Piece, to: number) => !p.k && rc(to)[0] === (p.s === 0 ? 0 : 7);

export function ckInit(): CkState {
  const board: (Piece | null)[] = Array(64).fill(null);
  for (let i = 0; i < 64; i++) {
    const [r, c] = rc(i);
    if ((r + c) % 2 === 1) {
      if (r <= 2) board[i] = { s: 1 };
      if (r >= 5) board[i] = { s: 0 };
    }
  }
  return { board, quiet: 0 };
}

/** Every capture sequence of the piece on `from` (a capture that crowns a man ends the move). */
function jumps(board: (Piece | null)[], from: number, piece: Piece): number[][] {
  const out: number[][] = [];
  const walk = (b: (Piece | null)[], at: number, p: Piece, path: number[]) => {
    let extended = false;
    const [r, c] = rc(at);
    for (const [dr, dc] of dirsOf(p)) {
      const over = sq(r + dr, c + dc), to = sq(r + 2 * dr, c + 2 * dc);
      if (over < 0 || to < 0 || b[to] !== null) continue;
      const victim = b[over];
      if (!victim || victim.s === p.s) continue;
      const nb = [...b];
      nb[at] = null; nb[over] = null;
      const king = crowns(p, to);
      const np = king ? { ...p, k: true } : p;
      nb[to] = np;
      extended = true;
      if (king) out.push([...path, to]);
      else walk(nb, to, np, [...path, to]);
    }
    if (!extended && path.length > 1) out.push(path);
  };
  walk(board, from, piece, [from]);
  return out;
}

/** Every legal move for `seat`. Captures are compulsory (any capture sequence may be chosen, played to its end). */
export function ckMoves(s: CkState, seat: Seat): number[][] {
  const caps: number[][] = [];
  const steps: number[][] = [];
  s.board.forEach((p, i) => {
    if (!p || p.s !== seat) return;
    caps.push(...jumps(s.board, i, p));
    const [r, c] = rc(i);
    for (const [dr, dc] of dirsOf(p)) {
      const to = sq(r + dr, c + dc);
      if (to >= 0 && s.board[to] === null) steps.push([i, to]);
    }
  });
  return caps.length ? caps : steps;
}

export const checkers: DuelGame<CkState, CkMove> = {
  id: "checkers", name: "Patron's Gambit", blurb: "Checkers: jumps are compulsory, reach the far side to crown a piece.",
  minMoves: 12,
  init: ckInit,
  parseMove: (raw) => {
    const path = (raw as { path?: unknown })?.path;
    return Array.isArray(path) && path.length >= 2 && path.length <= 13 && path.every((x) => Number.isInteger(x) && x >= 0 && x < 64) ? { path: path as number[] } : null;
  },
  apply(s, seat, { path }) {
    const legal = ckMoves(s, seat).some((m) => m.length === path.length && m.every((x, i) => x === path[i]));
    if (!legal) return { error: ckMoves(s, seat).some((m) => m.length > 2 || Math.abs(rc(m[0])[0] - rc(m[1])[0]) === 2) ? "You must jump." : "That move isn't allowed." };
    const board = [...s.board];
    let piece = board[path[0]]!;
    const wasMan = !piece.k;
    let captured = false;
    for (let i = 1; i < path.length; i++) {
      const [r0, c0] = rc(path[i - 1]), [r1, c1] = rc(path[i]);
      if (Math.abs(r1 - r0) === 2) { board[sq((r0 + r1) / 2, (c0 + c1) / 2)] = null; captured = true; }
      board[path[i - 1]] = null;
      if (crowns(piece, path[i])) piece = { ...piece, k: true };
      board[path[i]] = piece;
    }
    return { state: { board, quiet: captured || wasMan ? 0 : s.quiet + 1 }, next: other(seat) };
  },
  outcome(s, toMove) {
    if (!ckMoves(s, toMove).length) return { winner: other(toMove) };
    return s.quiet >= CK_QUIET_DRAW ? { draw: true } : null;
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GAMES: Record<GameId, DuelGame<any, any>> = { tictactoe, connect4, checkers };
export const GAME_IDS = Object.keys(GAMES) as GameId[];
export const isGameId = (g: unknown): g is GameId => typeof g === "string" && g in GAMES;
