import type { NavGroup } from "@restaurant-pos/ui/shell";
import {
  Activity,
  Banknote,
  BarChart3,
  BookOpen,
  Boxes,
  CalendarClock,
  CalendarDays,
  CalendarSync,
  Carrot,
  ChartBar,
  ClipboardCheck,
  Download,
  FileBadge,
  FileCheck2,
  FileStack,
  FileText,
  FolderTree,
  Gift,
  GitCompareArrows,
  Globe2,
  History,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LayoutGrid,
  MapPin,
  Package,
  PackagePlus,
  Percent,
  PiggyBank,
  Printer,
  QrCode,
  Receipt,
  RefreshCw,
  Repeat2,
  Scale,
  ScanLine,
  ScrollText,
  Send,
  SlidersHorizontal,
  Settings2,
  Shield,
  ShoppingCart,
  Smartphone,
  Table2,
  Tag,
  Tags,
  Target,
  Timer,
  Truck,
  Undo2,
  Users,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";

export type { NavGroup, NavMainItem, NavSubItem } from "@restaurant-pos/ui/shell";

/**
 * Hostess default RBAC: tables + catalog read + POS config/printer read — no back office.
 * Keep the shell minimal so the sidebar matches what they are allowed to use.
 */
export const hostessSidebarItems: NavGroup[] = [
  {
    id: 4,
    label: "Overview",
    items: [
      {
        title: "Floor",
        url: "/dashboard/floor",
        icon: LayoutGrid,
        permission: "pos.table.read",
      },
      {
        title: "Customers",
        url: "/dashboard/customers",
        icon: Users,
        permission: "pos.table.read",
      },
    ],
  },
];

export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "Dashboards",
    items: [
      {
        title: "Default Dashboard",
        url: "/dashboard/default",
        icon: LayoutDashboard,
      },
      {
        title: "CRM",
        url: "/dashboard/crm",
        icon: ChartBar,
      },
      {
        title: "Finance",
        url: "/dashboard/finance",
        icon: Banknote,
      },
    ],
  },

  {
    id: 4,
    label: "Overview",
    items: [
      {
        title: "Floor",
        url: "/dashboard/floor",
        icon: LayoutGrid,
      },
    ],
  },
  {
    id: 5,
    label: "Menu & Catalog",
    items: [
      {
        title: "Categories",
        url: "/dashboard/categories",
        icon: FolderTree,
      },
      {
        title: "Menu Items",
        url: "/dashboard/menu-items",
        icon: UtensilsCrossed,
      },
      {
        title: "Modifiers",
        url: "/dashboard/modifiers",
        icon: Tags,
      },
      {
        title: "Combos",
        url: "/dashboard/combos",
        icon: Gift,
      },
      {
        title: "Guest menu",
        url: "/dashboard/guest-menu",
        icon: Smartphone,
      },
    ],
  },
  {
    id: 6,
    label: "Stock — Core",
    items: [
      {
        title: "Ingredients",
        url: "/dashboard/ingredients",
        icon: Carrot,
        permission: "backoffice.inventory.read",
      },
      {
        title: "Ing. Categories",
        url: "/dashboard/ingredient-categories",
        icon: Tags,
        permission: "backoffice.inventory.read",
      },
      {
        title: "Suppliers",
        url: "/dashboard/suppliers",
        icon: Truck,
        permission: "backoffice.inventory.read",
      },
      {
        title: "Purchase Orders",
        url: "/dashboard/purchase-orders",
        icon: ShoppingCart,
        permission: "backoffice.inventory.read",
      },
      {
        title: "Goods receipt notes",
        url: "/dashboard/goods-receipt-notes",
        icon: FileCheck2,
        permission: "backoffice.inventory.read",
      },
      {
        title: "Recipes",
        url: "/dashboard/recipes",
        icon: BookOpen,
        permission: "backoffice.inventory.read",
      },
      {
        title: "Inventory",
        url: "/dashboard/inventory",
        icon: Package,
        permission: "backoffice.inventory.read",
      },
      {
        title: "Stock Take",
        url: "/dashboard/inventory/stock-take",
        icon: ClipboardCheck,
        permission: "backoffice.inventory.read",
      },
      {
        title: "Warehouse",
        url: "/dashboard/warehouse",
        icon: Boxes,
        permission: "backoffice.inventory.read",
      },
      {
        title: "Menu availability",
        url: "/dashboard/inventory/menu-availability",
        icon: Activity,
        permission: "backoffice.inventory.read",
      },
    ],
  },
  {
    id: 16,
    label: "Stock — Extended",
    items: [
      {
        title: "RFQ",
        url: "/dashboard/procurement/rfq",
        icon: Send,
        permission: "backoffice.inventory.read",
      },
      {
        title: "3-Way match",
        url: "/dashboard/procurement/reconciliation",
        icon: GitCompareArrows,
        permission: "backoffice.inventory.read",
      },
      {
        title: "Vendor returns (RTV)",
        url: "/dashboard/inventory/vendor-returns",
        icon: Undo2,
        permission: "backoffice.inventory.read",
      },
      {
        title: "Customer returns",
        url: "/dashboard/inventory/returns",
        icon: PackagePlus,
        permission: "backoffice.inventory.read",
      },
      {
        title: "Inventory analytics",
        url: "/dashboard/inventory/analytics",
        icon: BarChart3,
        permission: "backoffice.inventory.read",
      },
      {
        title: "Wastage",
        url: "/dashboard/inventory/wastage",
        icon: Boxes,
        permission: "backoffice.inventory.read",
      },
      {
        title: "Barcode lookup",
        url: "/dashboard/inventory/barcode-lookup",
        icon: ScanLine,
        permission: "backoffice.inventory.read",
      },
      {
        title: "Serial tracker",
        url: "/dashboard/inventory/serials",
        icon: QrCode,
        permission: "backoffice.inventory.read",
      },
    ],
  },
  {
    id: 7,
    label: "Business",
    items: [
      {
        title: "Staff",
        url: "/dashboard/staff",
        icon: Users,
      },
      {
        title: "Locations",
        url: "/dashboard/locations",
        icon: MapPin,
      },
      {
        title: "POS configuration",
        url: "/dashboard/settings/pos-config",
        icon: SlidersHorizontal,
      },
      {
        title: "Printers",
        url: "/dashboard/printers",
        icon: Printer,
      },
      {
        title: "Receipt config",
        url: "/dashboard/receipt-config",
        icon: Receipt,
      },
      {
        title: "Customers",
        url: "/dashboard/customers",
        icon: Users,
      },
      {
        title: "Tax & treasury",
        url: "/dashboard/tax",
        icon: Percent,
      },
      {
        title: "Reports",
        url: "/dashboard/reports",
        icon: BarChart3,
      },
      {
        title: "Discounts",
        url: "/dashboard/discounts",
        icon: Tag,
      },
    ],
  },
  {
    id: 8,
    label: "Accounting — Core",
    items: [
      {
        title: "Overview",
        url: "/dashboard/accounting",
        icon: LayoutDashboard,
      },
      {
        title: "Chart of accounts",
        url: "/dashboard/accounting/accounts",
        icon: Landmark,
      },
      {
        title: "Entries",
        url: "/dashboard/accounting/ledger",
        icon: ScrollText,
      },
      {
        title: "GL settings",
        url: "/dashboard/accounting/settings",
        icon: Settings2,
      },
      {
        title: "Register sessions",
        url: "/dashboard/accounting/sessions",
        icon: Timer,
      },
      {
        title: "Trial balance",
        url: "/dashboard/accounting/trial-balance",
        icon: Table2,
      },
      {
        title: "Profit & Loss",
        url: "/dashboard/accounting/pnl",
        icon: BarChart3,
      },
      {
        title: "Fiscal periods",
        url: "/dashboard/accounting/periods",
        icon: CalendarDays,
      },
    ],
  },
  {
    id: 17,
    label: "Accounting — Extended",
    items: [
      {
        title: "Balance sheet",
        url: "/dashboard/accounting/balance-sheet",
        icon: Scale,
      },
      {
        title: "Cash flow",
        url: "/dashboard/accounting/cash-flow",
        icon: Banknote,
      },
      {
        title: "Budget vs actual",
        url: "/dashboard/accounting/budget-vs-actual",
        icon: Target,
      },
      {
        title: "Budgets",
        url: "/dashboard/accounting/budgets",
        icon: Wallet,
      },
      {
        title: "Exchange rates",
        url: "/dashboard/tax?tab=fx",
        icon: Globe2,
      },
      {
        title: "Recurring journals",
        url: "/dashboard/accounting/recurring-journals",
        icon: Repeat2,
      },
      {
        title: "Invoices (AR)",
        url: "/dashboard/accounting/invoices",
        icon: Receipt,
      },
      {
        title: "Recurring invoices",
        url: "/dashboard/accounting/recurring-invoices",
        icon: CalendarSync,
      },
      {
        title: "AR aging",
        url: "/dashboard/accounting/ar-aging",
        icon: CalendarClock,
      },
      {
        title: "Customer statement",
        url: "/dashboard/accounting/customer-statement",
        icon: FileText,
      },
      {
        title: "Supplier statement",
        url: "/dashboard/accounting/supplier-statement",
        icon: FileText,
      },
      {
        title: "Credit notes",
        url: "/dashboard/accounting/credit-notes",
        icon: FileBadge,
      },
      {
        title: "Vendor bills (AP)",
        url: "/dashboard/accounting/vendor-bills",
        icon: FileStack,
      },
      {
        title: "Expense reports",
        url: "/dashboard/accounting/expense-reports",
        icon: ClipboardCheck,
        permission: "backoffice.accounting.expenses.read",
      },
      {
        title: "Approvals inbox",
        url: "/dashboard/accounting/approvals",
        icon: FileCheck2,
        permission: "backoffice.accounting.approvals.read",
      },
      {
        title: "Consolidated reports",
        url: "/dashboard/accounting/consolidated",
        icon: GitCompareArrows,
        permission: "backoffice.accounting.consolidated.read",
      },
      {
        title: "Audit log",
        url: "/dashboard/accounting/audit-log",
        icon: History,
      },
      {
        title: "GL exports",
        url: "/dashboard/accounting/exports",
        icon: Download,
      },
      {
        title: "Gift cards",
        url: "/dashboard/accounting/gift-cards",
        icon: Gift,
      },
      {
        title: "Order GL tools",
        url: "/dashboard/accounting/order-gl",
        icon: RefreshCw,
      },
      {
        title: "Bank (beta)",
        url: "/dashboard/accounting/bank",
        icon: PiggyBank,
      },
    ],
  },
  {
    id: 9,
    label: "System",
    items: [
      {
        title: "Roles & RBAC",
        url: "/dashboard/rbac",
        icon: Shield,
      },
      {
        title: "POS sign-in",
        url: "/login",
        icon: KeyRound,
      },
    ],
  },
];
