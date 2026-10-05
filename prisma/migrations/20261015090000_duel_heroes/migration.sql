-- Duels: each player picks a hero as their playing stone (null: the plain soul orb).
ALTER TABLE "Duel" ADD COLUMN "heroA" INTEGER, ADD COLUMN "heroB" INTEGER;
