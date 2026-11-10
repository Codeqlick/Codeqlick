-- The menu extra of basic websites (architecture 8.2): off until the team turns it on.
ALTER TABLE "managed_sites" ADD COLUMN "menu_enabled" BOOLEAN NOT NULL DEFAULT false;
