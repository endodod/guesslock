-- Admin-edited settings by key (first: "weapon-groups", the weapon type -> weapon family table of The Reckoning). Additive.
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);
