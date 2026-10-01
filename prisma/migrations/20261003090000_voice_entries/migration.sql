-- CreateTable
CREATE TABLE "VoiceEntry" (
    "id" SERIAL NOT NULL,
    "heroId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "abilityId" BIGINT,
    "abilitySlot" INTEGER,
    "otherHeroId" INTEGER,
    "text" TEXT,
    "lines" JSONB,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VoiceEntry_heroId_kind_status_idx" ON "VoiceEntry"("heroId", "kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceEntry_heroId_kind_fileKey_key" ON "VoiceEntry"("heroId", "kind", "fileKey");
