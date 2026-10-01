-- Endless mode: practice puzzles built on demand.
CREATE TABLE "EndlessPuzzle" (
    "id" TEXT NOT NULL,
    "lock" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EndlessPuzzle_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EndlessPuzzle_createdAt_idx" ON "EndlessPuzzle"("createdAt");
