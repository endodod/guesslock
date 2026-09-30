-- CreateTable
CREATE TABLE "HeroSoundMap" (
    "heroId" INTEGER NOT NULL,
    "abilityFolders" TEXT[],
    "weaponFolders" TEXT[],
    "source" TEXT NOT NULL DEFAULT 'auto',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HeroSoundMap_pkey" PRIMARY KEY ("heroId")
);

-- CreateTable
CREATE TABLE "SoundClip" (
    "id" SERIAL NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "heroId" INTEGER,
    "abilityId" BIGINT,
    "kind" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'suggested',
    "autoReason" TEXT,
    "preferred" BOOLEAN NOT NULL DEFAULT false,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "changed" BOOLEAN NOT NULL DEFAULT false,
    "missing" BOOLEAN NOT NULL DEFAULT false,
    "durationMs" INTEGER,
    "peakDb" DOUBLE PRECISION,
    "loudnessDb" DOUBLE PRECISION,
    "gainDb" DOUBLE PRECISION,
    "assetId" TEXT,
    "sourceHash" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "measuredAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SoundClip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SoundClip_sourceUrl_key" ON "SoundClip"("sourceUrl");

-- CreateIndex
CREATE INDEX "SoundClip_heroId_status_idx" ON "SoundClip"("heroId", "status");

-- CreateIndex
CREATE INDEX "SoundClip_abilityId_status_idx" ON "SoundClip"("abilityId", "status");

-- AddForeignKey
ALTER TABLE "HeroSoundMap" ADD CONSTRAINT "HeroSoundMap_heroId_fkey" FOREIGN KEY ("heroId") REFERENCES "Hero"("id") ON DELETE CASCADE ON UPDATE CASCADE;

