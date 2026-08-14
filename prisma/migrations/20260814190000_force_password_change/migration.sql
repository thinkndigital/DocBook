-- Accounts created by an admin start on the shared assigned password. Flag them so the
-- app can require a change before the session is allowed anywhere else.
ALTER TABLE "users" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: every existing non-patient account was created through an admin flow and has
-- never been forced to change from the default. Patients who registered themselves chose
-- their own password, so they are deliberately excluded.
UPDATE "users" SET "mustChangePassword" = true WHERE "role" <> 'PATIENT';
