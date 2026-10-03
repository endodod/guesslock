-- Player reports from /feedback (puzzle bugs and wrong data values), reviewed in /admin/feedback. Additive.
CREATE TABLE "Feedback" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "date" TEXT,
    "lock" TEXT,
    "entity" TEXT,
    "entityId" INTEGER,
    "entityName" TEXT,
    "field" TEXT,
    "fieldLabel" TEXT,
    "currentValue" TEXT,
    "suggested" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "page" TEXT,
    "userId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Feedback_status_createdAt_idx" ON "Feedback"("status", "createdAt");
