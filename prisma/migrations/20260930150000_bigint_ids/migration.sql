-- Ability/item ids from the API are unsigned 32-bit and overflow INTEGER.
ALTER TABLE "Ability" ALTER COLUMN "id" SET DATA TYPE BIGINT;
ALTER TABLE "Item" ALTER COLUMN "id" SET DATA TYPE BIGINT;
ALTER TABLE "TextEntry" ALTER COLUMN "entityId" SET DATA TYPE BIGINT;
