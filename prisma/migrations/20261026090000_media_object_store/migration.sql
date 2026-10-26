-- Mirrored media can live in an S3-compatible object store (MEDIA_S3_*): such rows keep bytes = null.
ALTER TABLE "MirroredAsset" ALTER COLUMN "bytes" DROP NOT NULL;
