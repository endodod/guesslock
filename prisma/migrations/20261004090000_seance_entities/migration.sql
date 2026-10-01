-- The Séance family: groups about heroes, items or abilities.
ALTER TABLE "SeanceCategory" ADD COLUMN "entity" TEXT NOT NULL DEFAULT 'hero';
CREATE INDEX "SeanceCategory_entity_type_status_idx" ON "SeanceCategory"("entity", "type", "status");

ALTER TABLE "SeanceMembership" DROP CONSTRAINT "SeanceMembership_pkey";
DROP INDEX "SeanceMembership_heroId_idx";
ALTER TABLE "SeanceMembership" RENAME COLUMN "heroId" TO "entityId";
ALTER TABLE "SeanceMembership" ALTER COLUMN "entityId" TYPE BIGINT;
ALTER TABLE "SeanceMembership" ADD CONSTRAINT "SeanceMembership_pkey" PRIMARY KEY ("categoryId", "entityId");
CREATE INDEX "SeanceMembership_entityId_idx" ON "SeanceMembership"("entityId");
