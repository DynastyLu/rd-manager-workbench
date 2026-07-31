CREATE TYPE "app"."UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISABLED', 'LOCKED');
CREATE TYPE "app"."DataScope" AS ENUM ('SELF', 'INVOLVED', 'DEPARTMENT', 'PROJECT', 'ALL');

CREATE TABLE "app"."users" (
  "id" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "employee_no" TEXT,
  "password_hash" TEXT NOT NULL,
  "status" "app"."UserStatus" NOT NULL DEFAULT 'PENDING',
  "must_change_password" BOOLEAN NOT NULL DEFAULT true,
  "failed_login_count" INTEGER NOT NULL DEFAULT 0,
  "locked_until" TIMESTAMPTZ(6),
  "password_changed_at" TIMESTAMPTZ(6),
  "last_login_at" TIMESTAMPTZ(6),
  "permission_version" INTEGER NOT NULL DEFAULT 0,
  "resource_profile_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app"."roles" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "is_enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app"."permissions" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "description" TEXT,
  "is_sensitive" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app"."user_roles" (
  "user_id" TEXT NOT NULL,
  "role_id" TEXT NOT NULL,
  "assigned_by_user_id" TEXT,
  "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id", "role_id")
);

CREATE TABLE "app"."role_permissions" (
  "role_id" TEXT NOT NULL,
  "permission_id" TEXT NOT NULL,
  "data_scope" "app"."DataScope" NOT NULL DEFAULT 'SELF',
  "scope_config" JSONB,
  CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id")
);

CREATE TABLE "app"."auth_sessions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "refresh_token_hash" TEXT NOT NULL,
  "token_family_id" TEXT NOT NULL,
  "rotated_to_session_id" TEXT,
  "device_name" TEXT,
  "user_agent" TEXT,
  "ip_address" TEXT,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "last_used_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "revoke_reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app"."login_audits" (
  "id" TEXT NOT NULL,
  "user_id" TEXT,
  "username" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "success" BOOLEAN NOT NULL,
  "failure_reason" TEXT,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "session_id" TEXT,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "login_audits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_username_key" ON "app"."users"("username");
CREATE UNIQUE INDEX "users_employee_no_key" ON "app"."users"("employee_no");
CREATE UNIQUE INDEX "users_resource_profile_id_key" ON "app"."users"("resource_profile_id");
CREATE UNIQUE INDEX "roles_code_key" ON "app"."roles"("code");
CREATE UNIQUE INDEX "permissions_code_key" ON "app"."permissions"("code");
CREATE INDEX "user_roles_role_id_idx" ON "app"."user_roles"("role_id");
CREATE INDEX "user_roles_assigned_by_user_id_idx" ON "app"."user_roles"("assigned_by_user_id");
CREATE INDEX "role_permissions_permission_id_idx" ON "app"."role_permissions"("permission_id");
CREATE UNIQUE INDEX "auth_sessions_refresh_token_hash_key" ON "app"."auth_sessions"("refresh_token_hash");
CREATE UNIQUE INDEX "auth_sessions_rotated_to_session_id_key" ON "app"."auth_sessions"("rotated_to_session_id");
CREATE INDEX "auth_sessions_user_id_expires_at_idx" ON "app"."auth_sessions"("user_id", "expires_at");
CREATE INDEX "auth_sessions_token_family_id_idx" ON "app"."auth_sessions"("token_family_id");
CREATE INDEX "auth_sessions_revoked_at_idx" ON "app"."auth_sessions"("revoked_at");
CREATE INDEX "login_audits_user_id_occurred_at_idx" ON "app"."login_audits"("user_id", "occurred_at");
CREATE INDEX "login_audits_username_occurred_at_idx" ON "app"."login_audits"("username", "occurred_at");
CREATE INDEX "login_audits_event_type_occurred_at_idx" ON "app"."login_audits"("event_type", "occurred_at");

ALTER TABLE "app"."users"
ADD CONSTRAINT "users_resource_profile_id_fkey"
FOREIGN KEY ("resource_profile_id") REFERENCES "app"."resource_profiles"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app"."user_roles"
ADD CONSTRAINT "user_roles_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "app"."users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app"."user_roles"
ADD CONSTRAINT "user_roles_role_id_fkey"
FOREIGN KEY ("role_id") REFERENCES "app"."roles"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app"."user_roles"
ADD CONSTRAINT "user_roles_assigned_by_user_id_fkey"
FOREIGN KEY ("assigned_by_user_id") REFERENCES "app"."users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."role_permissions"
ADD CONSTRAINT "role_permissions_role_id_fkey"
FOREIGN KEY ("role_id") REFERENCES "app"."roles"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."role_permissions"
ADD CONSTRAINT "role_permissions_permission_id_fkey"
FOREIGN KEY ("permission_id") REFERENCES "app"."permissions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app"."auth_sessions"
ADD CONSTRAINT "auth_sessions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "app"."users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app"."auth_sessions"
ADD CONSTRAINT "auth_sessions_rotated_to_session_id_fkey"
FOREIGN KEY ("rotated_to_session_id") REFERENCES "app"."auth_sessions"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."login_audits"
ADD CONSTRAINT "login_audits_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "app"."users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
