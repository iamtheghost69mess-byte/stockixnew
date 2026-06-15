UPDATE "platform_roles"
SET "permissions" = (
  SELECT jsonb_agg(DISTINCT elem)
  FROM (
    SELECT jsonb_array_elements_text("permissions") AS elem
    UNION ALL
    SELECT 'tenants.org_scope'
  ) s
)
WHERE "slug" = 'support_agent'
  AND NOT ("permissions" @> '["tenants.org_scope"]'::jsonb);
