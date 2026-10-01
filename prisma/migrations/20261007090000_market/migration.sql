-- The Black Market: spending souls on cosmetics, cases and trades.
ALTER TABLE "Profile" ADD COLUMN "equippedTitle" TEXT, ADD COLUMN "equippedColor" TEXT, ADD COLUMN "equippedTheme" TEXT;

CREATE TABLE "Wallet" (
    "userId" TEXT NOT NULL,
    "adjust" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("userId")
);
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SoulLedger" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "ref" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SoulLedger_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SoulLedger_userId_createdAt_idx" ON "SoulLedger"("userId", "createdAt");

CREATE TABLE "InventoryItem" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "obtainedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InventoryItem_userId_idx" ON "InventoryItem"("userId");
CREATE INDEX "InventoryItem_userId_itemKey_idx" ON "InventoryItem"("userId", "itemKey");
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TradeOffer" (
    "id" SERIAL NOT NULL,
    "fromUser" TEXT NOT NULL,
    "toUser" TEXT NOT NULL,
    "giveItems" INTEGER[],
    "giveSouls" INTEGER NOT NULL DEFAULT 0,
    "wantItems" INTEGER[],
    "wantSouls" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "TradeOffer_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TradeOffer_toUser_status_idx" ON "TradeOffer"("toUser", "status");
CREATE INDEX "TradeOffer_fromUser_status_idx" ON "TradeOffer"("fromUser", "status");
