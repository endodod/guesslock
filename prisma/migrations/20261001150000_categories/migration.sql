ALTER TABLE "Hero" ADD COLUMN "attrs" JSONB;
ALTER TABLE "Item" ADD COLUMN "attrs" JSONB;

CREATE TABLE "Category" (
    "key" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "info" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '',
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("key")
);

-- Two custom hero categories to fill in; each joins The Reckoning once every hero has a value.
INSERT INTO "Category" ("key", "entity", "label", "info", "type", "unit", "builtin", "enabled", "order", "updatedAt") VALUES
  ('hero.role', 'hero', 'Role', 'The hero''s team role. Orange means at least one shared role.', 'multi', '', false, true, 100, CURRENT_TIMESTAMP),
  ('hero.height', 'hero', 'Height', 'How tall the hero is. Arrows point toward the answer.', 'numeric', 'cm', false, true, 110, CURRENT_TIMESTAMP);
