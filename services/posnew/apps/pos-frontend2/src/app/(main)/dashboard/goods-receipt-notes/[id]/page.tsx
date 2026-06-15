import type { Metadata } from "next";

import { GoodsReceiptNoteDetailClient } from "../_components/goods-receipt-note-detail-client";

type Props = Readonly<{ params: Promise<{ id: string }> }>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const suffix = id.length >= 6 ? id.slice(-6) : id;
  return {
    title: `GRN ${suffix}`,
    description: "Review lines, lots, and confirm receipt into stock.",
  };
}

export default async function GoodsReceiptNoteDetailPage({ params }: Props) {
  const { id } = await params;
  return <GoodsReceiptNoteDetailClient grnId={id} />;
}
