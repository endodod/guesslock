import { describe, expect, it } from "vitest";
import { C4_COLS, checkers, ckInit, ckMoves, connect4, tictactoe, type CkState, type Piece, type Seat } from "@/lib/duels/games";
import { DUEL_WIN, duelRef, payableWin } from "@/lib/duels/rewards";

function play<S, M>(game: { init(): S; apply(s: S, seat: Seat, m: M): { state: S; next: Seat } | { error: string } }, moves: M[]) {
  let s = game.init();
  let seat: Seat = 0;
  for (const m of moves) {
    const r = game.apply(s, seat, m);
    if ("error" in r) throw new Error(r.error);
    s = r.state; seat = r.next;
  }
  return { s, seat };
}

describe("Three Souls (tic-tac-toe)", () => {
  it("finds a line, a draw, and refuses a taken square", () => {
    const won = play(tictactoe, [0, 3, 1, 4, 2].map((cell) => ({ cell })));
    expect(tictactoe.outcome(won.s, won.seat)).toEqual({ winner: 0 });
    const draw = play(tictactoe, [0, 1, 2, 4, 3, 5, 7, 6, 8].map((cell) => ({ cell })));
    expect(tictactoe.outcome(draw.s, draw.seat)).toEqual({ draw: true });
    expect(tictactoe.apply(won.s, 1, { cell: 0 })).toEqual({ error: "That square is taken." });
    expect(tictactoe.parseMove({ cell: 9 })).toBeNull();
  });
});

describe("Soul Wells (connect four)", () => {
  it("stacks souls and wins on four in a row, column or diagonal", () => {
    const col = play(connect4, [0, 1, 0, 1, 0, 1, 0].map((c) => ({ col: c })));
    expect(connect4.outcome(col.s, col.seat)).toEqual({ winner: 0 });
    const row = play(connect4, [0, 0, 1, 1, 2, 2, 3].map((c) => ({ col: c })));
    expect(connect4.outcome(row.s, row.seat)).toEqual({ winner: 0 });
    // Diagonal for seat 1: / from (5,1) to (2,4).
    const diag = play(connect4, [0, 1, 2, 2, 3, 3, 4, 3, 4, 4, 6, 4].map((c) => ({ col: c })));
    expect(connect4.outcome(diag.s, diag.seat)).toEqual({ winner: 1 });
  });

  it("refuses a full well", () => {
    const full = play(connect4, [0, 0, 0, 0, 0, 0].map((c) => ({ col: c })));
    expect(connect4.apply(full.s, 0, { col: 0 })).toEqual({ error: "That well is full." });
    expect(full.s.grid.slice(0, C4_COLS).filter((x) => x !== null)).toHaveLength(1);
  });
});

describe("Patron's Gambit (checkers)", () => {
  const empty = (): CkState => ({ board: Array(64).fill(null), quiet: 0 });
  const at = (s: CkState, i: number, p: Piece) => { s.board[i] = p; return s; };

  it("opens with seven moves for each side", () => {
    expect(ckMoves(ckInit(), 0)).toHaveLength(7);
    expect(ckMoves(ckInit(), 1)).toHaveLength(7);
  });

  it("makes jumps compulsory and plays multi-jumps to the end", () => {
    // Seat 0 man on 45 (row 5, col 5); seat 1 men on 36 and 20: a double jump 45 -> 27 -> 13.
    const s = at(at(at(empty(), 45, { s: 0 }), 36, { s: 1 }), 20, { s: 1 });
    at(s, 47, { s: 0 }); // a man that could step, but a jump is on
    expect(ckMoves(s, 0)).toEqual([[45, 27, 13]]);
    expect(checkers.apply(s, 0, { path: [47, 38] })).toEqual({ error: "You must jump." });
    const r = checkers.apply(s, 0, { path: [45, 27, 13] });
    if ("error" in r) throw new Error(r.error);
    expect(r.state.board[36]).toBeNull();
    expect(r.state.board[20]).toBeNull();
    expect(r.state.board[13]).toEqual({ s: 0 });
  });

  it("crowns a man on the far row, and a king moves backwards", () => {
    const s = at(empty(), 10, { s: 0 });
    at(s, 62, { s: 1 });
    const r = checkers.apply(s, 0, { path: [10, 1] });
    if ("error" in r) throw new Error(r.error);
    expect(r.state.board[1]).toEqual({ s: 0, k: true });
    expect(ckMoves({ ...r.state }, 0)).toContainEqual([1, 10]);
  });

  it("a side with no moves loses", () => {
    const s = at(empty(), 0, { s: 1 }); // nothing of seat 0's on the board
    expect(checkers.outcome(s, 0)).toEqual({ winner: 1 });
  });
});

describe("duel rewards", () => {
  it("pay once per opponent, game and day, and only real games", () => {
    expect(DUEL_WIN).toBeGreaterThan(0);
    expect(duelRef("connect4", "u2", "2026-10-05")).toBe("connect4:u2:2026-10-05");
    expect(payableWin({ game: "connect4", moves: 7, result: "win" })).toBe(true);
    expect(payableWin({ game: "connect4", moves: 4, result: "resign" })).toBe(false);
    expect(payableWin({ game: "tictactoe", moves: 9, result: "draw" })).toBe(false);
  });
});
