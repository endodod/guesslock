-- CreateTable
CREATE TABLE "Category" (
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

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryMembership" (
    "categoryId" INTEGER NOT NULL,
    "heroId" INTEGER NOT NULL,
    "member" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryMembership_pkey" PRIMARY KEY ("categoryId","heroId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_key_key" ON "Category"("key");

-- CreateIndex
CREATE INDEX "Category_type_status_idx" ON "Category"("type", "status");

-- CreateIndex
CREATE INDEX "CategoryMembership_heroId_idx" ON "CategoryMembership"("heroId");

-- AddForeignKey
ALTER TABLE "CategoryMembership" ADD CONSTRAINT "CategoryMembership_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
