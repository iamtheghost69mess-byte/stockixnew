CREATE INDEX IF NOT EXISTS "owner_notifications_owner_created_idx"
  ON "owner_notifications" ("owner_id", "created_at");
