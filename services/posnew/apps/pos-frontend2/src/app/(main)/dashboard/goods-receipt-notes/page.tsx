import type { Metadata } from "next";

import { GoodsReceiptNotesPageClient } from "./_components/goods-receipt-notes-page-client";

export const metadata: Metadata = {
  title: "Goods receipt notes",
  description: "Draft and confirm supplier receipts from purchase orders.",
};

export default function GoodsReceiptNotesPage() {
  return <GoodsReceiptNotesPageClient />;
}
