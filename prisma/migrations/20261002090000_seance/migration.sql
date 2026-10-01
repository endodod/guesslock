-- CreateTable
CREATE TABLE "SeanceCategory" (
    "id" SERIAL NOT NULL,
    "key" TEXT,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "explanation" TEXT,
    "source" TEXT NOT NULL,
    "difficulty" INTEGER NOT NULL DEFAULT 2,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flagReason" TEXT,
    "diff" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeanceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeanceMembership" (
    "categoryId" INTEGER NOT NULL,
    "heroId" INTEGER NOT NULL,
    "member" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeanceMembership_pkey" PRIMARY KEY ("categoryId","heroId")
);

-- CreateIndex
CREATE UNIQUE INDEX "SeanceCategory_key_key" ON "SeanceCategory"("key");

-- CreateIndex
CREATE INDEX "SeanceCategory_type_status_idx" ON "SeanceCategory"("type", "status");

-- CreateIndex
CREATE INDEX "SeanceMembership_heroId_idx" ON "SeanceMembership"("heroId");

-- AddForeignKey
ALTER TABLE "SeanceMembership" ADD CONSTRAINT "SeanceMembership_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SeanceCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
