-- One-time: drop every pre-generated puzzle from tomorrow on (puzzle day = Europe/Zurich), so they are rebuilt from
-- the corrected hero data of the previous migration. Puzzles freeze their data when built, so the old rows would
-- keep showing the wrong values. Today and past days stay as played. The Omens stay: they are real matches and use
-- none of this data. The daily generate cron and the vault's self-healing rebuild the missing days.
DELETE FROM "DailyPuzzle"
WHERE "date" > to_char((now() AT TIME ZONE 'Europe/Zurich')::date, 'YYYY-MM-DD')
  AND "mode" NOT IN ('clash', 'beast', 'rift');
