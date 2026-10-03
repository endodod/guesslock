-- Hero curation fixes, checked against the Deadlock Wiki (deadlock.wiki: infobox pronouns and release dates,
-- hero lore biographies and species categories, weapon spread notes) on 2026-10-03.
-- Data only. Rows that don't exist yet (e.g. a hero the sync hasn't created) are left alone.

-- Gender: the API lists Calico as male (wiki: She/Her). Pocket is They/Them in the game's own voice lines.
UPDATE "Hero" SET "genderOverride" = 'female' WHERE "id" = 16;    -- Calico
UPDATE "Hero" SET "genderOverride" = 'Nonbinary' WHERE "id" = 50; -- Pocket

-- Weapon: Silver's Hair of the Dog fires 7 pellets in a hexagon (a shotgun), although the API tags it Long Range.
UPDATE "Hero" SET "weaponTypeOverride" = 'Shotgun' WHERE "id" = 80; -- Silver

-- Species (comma-separated values share an orange "partial" tile).
UPDATE "Hero" SET "species" = 'Ixian' WHERE "id" = 6;              -- Abrams: "Abrams is Ixian"
UPDATE "Hero" SET "species" = 'Undead' WHERE "id" = 2;             -- Seven: "a charred undead man" (Category:Undead)
UPDATE "Hero" SET "species" = 'Undead' WHERE "id" = 3;             -- Vindicta: died in the Salem trials, returned (Category:Undead)
UPDATE "Hero" SET "species" = 'Mole man' WHERE "id" = 18;          -- Mo & Krill: "Mo is a mole man", Krill's species unknown
UPDATE "Hero" SET "species" = 'Human' WHERE "id" = 52;             -- Mirage: a human serving the Djinn (Category:Humans)
UPDATE "Hero" SET "species" = 'Gorgon' WHERE "id" = 58;            -- Vyper: "Vyper is a gorgon"
UPDATE "Hero" SET "species" = 'Undead' WHERE "id" = 60;            -- Sinclair: two dead magicians in one body (Category:Undead)
UPDATE "Hero" SET "species" = 'Vampire, Undead' WHERE "id" = 63;   -- Mina (Categories: Undead, Vampires)
UPDATE "Hero" SET "species" = 'Vampire, Undead' WHERE "id" = 64;   -- Drifter: "a feral vampire" (Categories: Undead, Vampires)
UPDATE "Hero" SET "species" = 'Star' WHERE "id" = 11;              -- Dynamo: lost his human body, now "a dying star"
UPDATE "Hero" SET "species" = 'God' WHERE "id" = 69;               -- The Doorman: "a fledgling god" (Category:Gods)
UPDATE "Hero" SET "species" = 'Unicorn' WHERE "id" = 81;           -- Celeste: hides "her identity as a unicorn"

-- Rat King (released 2026-10-02): curated columns only join the Reckoning once every hero has a value.
UPDATE "Hero" SET "species" = COALESCE("species", 'Rat'), "releaseDate" = COALESCE("releaseDate", DATE '2026-10-02') WHERE "id" = 84;
