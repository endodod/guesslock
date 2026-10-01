-- Hard mode: chosen per lock before the first guess.
ALTER TABLE "Play" ADD COLUMN "hard" BOOLEAN NOT NULL DEFAULT false;
