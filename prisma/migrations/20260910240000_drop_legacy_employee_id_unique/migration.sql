-- Drop the legacy global unique index on employee_id.
-- This index was created in the initial migration (20260901030658) before
-- multi-tenant scoping was introduced. The schema now has a composite
-- unique constraint @@unique([employeeId, businessId]), so the old
-- single-column unique index prevents the same EMP number from being
-- used across businesses and must be removed.

DROP INDEX IF EXISTS "employees_employee_id_key";
