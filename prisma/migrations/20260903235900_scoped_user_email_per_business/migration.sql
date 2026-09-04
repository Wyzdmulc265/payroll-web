-- Scope user email uniqueness per business so one person can hold accounts
-- in multiple businesses with the same email address.
--
-- Postgres treats NULL as distinct in composite unique constraints, so
-- (email, NULL) rows would otherwise still allow duplicate SUPER_ADMIN
-- emails. The partial unique index keeps business-less (SUPER_ADMIN)
-- emails globally unique while tenant emails are unique per business.

-- DropIndex
DROP INDEX "users_email_key";

-- CreateIndex
CREATE UNIQUE INDEX "users_email_business_id_key" ON "users"("email", "business_id");

-- Partial unique index for business-less users (SUPER_ADMIN)
CREATE UNIQUE INDEX "users_email_no_business_key" ON "users"("email") WHERE "business_id" IS NULL;
