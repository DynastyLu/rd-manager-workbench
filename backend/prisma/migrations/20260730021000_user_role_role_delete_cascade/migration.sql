ALTER TABLE "app"."user_roles"
DROP CONSTRAINT "user_roles_role_id_fkey";

ALTER TABLE "app"."user_roles"
ADD CONSTRAINT "user_roles_role_id_fkey"
FOREIGN KEY ("role_id") REFERENCES "app"."roles"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
