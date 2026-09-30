-- CreateTable
CREATE TABLE "ApiSnapshot" (
    "key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiSnapshot_pkey" PRIMARY KEY ("key")
);
