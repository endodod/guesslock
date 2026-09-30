-- CreateTable
CREATE TABLE "Profile" (
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "showOnBoards" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Play" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "lock" TEXT NOT NULL,
    "guesses" TEXT[],
    "bonus" TEXT,
    "status" TEXT NOT NULL,
    "hintsUsed" INTEGER NOT NULL DEFAULT 0,
    "noHints" BOOLEAN NOT NULL DEFAULT false,
    "souls" INTEGER NOT NULL DEFAULT 0,
    "bonusCorrect" BOOLEAN NOT NULL DEFAULT false,
    "archive" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'live',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Play_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserStats" (
    "userId" TEXT NOT NULL,
    "totalSouls" INTEGER NOT NULL DEFAULT 0,
    "daysUnlocked" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "bestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastDay" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserStats_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Profile_nameKey_key" ON "Profile"("nameKey");

-- CreateIndex
CREATE INDEX "Play_date_source_archive_idx" ON "Play"("date", "source", "archive");

-- CreateIndex
CREATE UNIQUE INDEX "Play_userId_date_lock_key" ON "Play"("userId", "date", "lock");

-- AddForeignKey
ALTER TABLE "Play" ADD CONSTRAINT "Play_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStats" ADD CONSTRAINT "UserStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

