-- Duels: 1v1 games between players (tic-tac-toe, connect four, checkers). Additive.
CREATE TABLE "Duel" (
    "id" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "playerA" TEXT NOT NULL,
    "playerB" TEXT,
    "invitee" TEXT,
    "state" JSONB NOT NULL,
    "turn" INTEGER NOT NULL DEFAULT 0,
    "moves" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'invited',
    "winner" INTEGER,
    "result" TEXT,
    "paid" INTEGER NOT NULL DEFAULT 0,
    "lastMoveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Duel_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Duel_playerA_status_idx" ON "Duel"("playerA", "status");
CREATE INDEX "Duel_playerB_status_idx" ON "Duel"("playerB", "status");
CREATE INDEX "Duel_invitee_status_idx" ON "Duel"("invitee", "status");
