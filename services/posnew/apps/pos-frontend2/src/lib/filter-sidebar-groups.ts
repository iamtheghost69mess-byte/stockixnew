import type { NavGroup } from "@restaurant-pos/ui/shell";

import { posCan } from "@/lib/pos-permissions";

/**
 * Drops nav items the current user cannot access (permission strings from GET /api/user).
 */
export function filterSidebarGroupsByPermissions(
  groups: readonly NavGroup[],
  permissions: readonly string[],
): NavGroup[] {
  return groups
    .map((group) => {
      const items = group.items
        .map((item) => {
          if (item.permission && !posCan([...permissions], item.permission)) {
            return null;
          }
          if (item.subItems?.length) {
            const subItems = item.subItems.filter((sub) => !sub.permission || posCan([...permissions], sub.permission));
            if (subItems.length === 0) return null;
            return { ...item, subItems };
          }
          return item;
        })
        .filter((item): item is NonNullable<typeof item> => item != null);
      return { ...group, items };
    })
    .filter((g) => g.items.length > 0);
}
