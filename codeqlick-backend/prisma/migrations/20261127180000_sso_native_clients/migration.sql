-- Desktop programs sign in by single sign-on with a redirect to a port on the person's own
-- machine: their codes keep that address, and the exchange must name it again. Null for the
-- website and the web apps.

-- AlterTable
ALTER TABLE "sso_codes" ADD COLUMN     "redirect_uri" TEXT;
