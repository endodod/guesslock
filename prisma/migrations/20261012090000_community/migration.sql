-- Community puzzles: player-made sorting tables and Constellations, their play counters and reports. Additive.
CREATE TABLE "CommunityPuzzle" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "entity" TEXT,
    "title" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'live',
    "plays" INTEGER NOT NULL DEFAULT 0,
    "solves" INTEGER NOT NULL DEFAULT 0,
    "reports" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunityPuzzle_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CommunityPuzzle_status_createdAt_idx" ON "CommunityPuzzle"("status", "createdAt");
CREATE INDEX "CommunityPuzzle_authorId_createdAt_idx" ON "CommunityPuzzle"("authorId", "createdAt");

CREATE TABLE "CommunityPlay" (
    "puzzleId" TEXT NOT NULL,
    "player" TEXT NOT NULL,
    "solved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunityPlay_pkey" PRIMARY KEY ("puzzleId", "player")
);

CREATE TABLE "CommunityReport" (
    "puzzleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunityReport_pkey" PRIMARY KEY ("puzzleId", "userId")
);
