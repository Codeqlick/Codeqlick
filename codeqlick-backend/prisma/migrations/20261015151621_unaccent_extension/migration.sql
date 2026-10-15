-- Accent-insensitive search in the blog ("version" finds "versión"). `unaccent` is a trusted
-- extension: the database owner can create it.
CREATE EXTENSION IF NOT EXISTS unaccent;
