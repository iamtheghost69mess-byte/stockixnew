CREATE TABLE IF NOT EXISTS "platform_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "is_system" boolean DEFAULT false NOT NULL,
  "permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "platform_roles_slug_unique" ON "platform_roles" ("slug");

ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "role_id" uuid;

DO $$ BEGIN
  ALTER TABLE "owners" ADD CONSTRAINT "owners_role_id_platform_roles_id_fk"
    FOREIGN KEY ("role_id") REFERENCES "platform_roles"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

INSERT INTO "platform_roles" ("name", "slug", "is_system", "permissions")
VALUES
  ('Super Admin', 'super_admin', true, '["*"]'::jsonb),
  ('Support Agent', 'support_agent', true, '["tenants.read","tenants.write","tenants.provision","licenses.read","licenses.write","licenses.extend","plans.read"]'::jsonb),
  ('Billing Manager', 'billing_manager', true, '["tenants.read","licenses.read","licenses.extend","plans.read"]'::jsonb),
  ('Read Only', 'read_only', true, '["tenants.read","licenses.read","plans.read"]'::jsonb)
ON CONFLICT ("slug") DO NOTHING;

UPDATE "owners" o
SET "role_id" = pr.id
FROM "platform_roles" pr
WHERE o."role_id" IS NULL AND pr."slug" = o."role";
