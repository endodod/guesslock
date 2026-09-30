-- CreateTable
CREATE TABLE "OmenMatch" (
    "matchId" BIGINT NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "startTime" TIMESTAMP(3),
    "jobs" JSONB,
    "submittedAt" TIMESTAMP(3),
    "timelineGz" BYTEA,
    "error" TEXT,
    "requestedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OmenMatch_pkey" PRIMARY KEY ("matchId")
);

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "omen" TEXT NOT NULL,
    "matchId" BIGINT NOT NULL,
    "t" INTEGER NOT NULL,
    "window" INTEGER NOT NULL,
    "positive" BOOLEAN NOT NULL,
    "quality" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "patch" TEXT,
    "status" TEXT NOT NULL DEFAULT 'candidate',
    "dailyDate" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OmenConfig" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OmenConfig_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "OmenMatch_status_priority_idx" ON "OmenMatch"("status", "priority");

-- CreateIndex
CREATE INDEX "Scenario_omen_source_status_idx" ON "Scenario"("omen", "source", "status");

-- CreateIndex
CREATE INDEX "Scenario_dailyDate_idx" ON "Scenario"("dailyDate");

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "OmenMatch"("matchId") ON DELETE CASCADE ON UPDATE CASCADE;

