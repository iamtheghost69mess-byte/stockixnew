import type { LucideIcon } from "lucide-react";

export interface NavSubItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  badge?: string | number;
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
  /** When set, the item is hidden unless the user has this permission (client-side filter). */
  permission?: string;
}

export interface NavMainItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  badge?: string | number;
  subItems?: NavSubItem[];
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
  /** When set, the item is hidden unless the user has this permission (client-side filter). */
  permission?: string;
}

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}
