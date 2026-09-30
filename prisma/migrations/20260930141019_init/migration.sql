-- CreateTable
CREATE TABLE "SyncRun" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "clientVersion" INTEGER,
    "counts" JSONB,
    "diff" JSONB,
    "issues" JSONB,
    "error" TEXT,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hero" (
    "id" INTEGER NOT NULL,
    "className" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" JSONB NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "species" TEXT,
    "releaseDate" DATE,
    "genderOverride" TEXT,
    "weaponTypeOverride" TEXT,
    "aliases" TEXT[],
    "emojis" TEXT[],
    "emojisReviewed" BOOLEAN NOT NULL DEFAULT false,
    "genericVoice" BOOLEAN NOT NULL DEFAULT false,
    "genericVoiceManual" BOOLEAN NOT NULL DEFAULT false,
    "voiceImportedAt" TIMESTAMP(3),
    "voiceRevisionId" INTEGER,
    "excludeFromModes" TEXT[],
    "needsReview" BOOLEAN NOT NULL DEFAULT true,
    "reviewReasons" TEXT[],
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "Hero_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ability" (
    "id" INTEGER NOT NULL,
    "className" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "heroId" INTEGER NOT NULL,
    "slot" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" JSONB NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "aliases" TEXT[],
    "excludeFromModes" TEXT[],
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "reviewReasons" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" INTEGER NOT NULL,
    "className" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" JSONB NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "aliases" TEXT[],
    "excludeFromModes" TEXT[],
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "reviewReasons" TEXT[],
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TextEntry" (
    "id" SERIAL NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "sourceText" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "autoText" TEXT NOT NULL,
    "finalText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'auto',
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TextEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceLine" (
    "id" SERIAL NOT NULL,
    "heroId" INTEGER NOT NULL,
    "wikiPage" TEXT NOT NULL,
    "revisionId" INTEGER NOT NULL,
    "section" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "text" TEXT,
    "autoText" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "audioAssetId" TEXT,
    "status" TEXT NOT NULL,
    "autoReason" TEXT,
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "manuallyEdited" BOOLEAN NOT NULL DEFAULT false,
    "sourceChanged" BOOLEAN NOT NULL DEFAULT false,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MirroredAsset" (
    "id" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MirroredAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyPuzzle" (
    "id" SERIAL NOT NULL,
    "date" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dataVersion" INTEGER,
    "sealed" BOOLEAN NOT NULL DEFAULT false,
    "sealedReason" TEXT,
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyPuzzle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Hero_className_key" ON "Hero"("className");

-- CreateIndex
CREATE UNIQUE INDEX "Ability_className_key" ON "Ability"("className");

-- CreateIndex
CREATE UNIQUE INDEX "Item_className_key" ON "Item"("className");

-- CreateIndex
CREATE UNIQUE INDEX "TextEntry_entityType_entityId_key" ON "TextEntry"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceLine_heroId_fileName_key" ON "VoiceLine"("heroId", "fileName");

-- CreateIndex
CREATE UNIQUE INDEX "MirroredAsset_sourceUrl_key" ON "MirroredAsset"("sourceUrl");

-- CreateIndex
CREATE INDEX "DailyPuzzle_mode_date_idx" ON "DailyPuzzle"("mode", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyPuzzle_date_mode_key" ON "DailyPuzzle"("date", "mode");

-- AddForeignKey
ALTER TABLE "Ability" ADD CONSTRAINT "Ability_heroId_fkey" FOREIGN KEY ("heroId") REFERENCES "Hero"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceLine" ADD CONSTRAINT "VoiceLine_heroId_fkey" FOREIGN KEY ("heroId") REFERENCES "Hero"("id") ON DELETE CASCADE ON UPDATE CASCADE;
