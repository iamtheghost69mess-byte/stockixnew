import type { Metadata } from "next";

import { PosTableSessionPage } from "../../_components/pos-table-session-page";

type Props = Readonly<{ params: Promise<{ tableId: string }> }>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tableId } = await params;
  return {
    title: `Table ${tableId.slice(0, 6)}…`,
    description: "POS check",
  };
}

export default async function PosTablePage({ params }: Props) {
  const { tableId } = await params;
  return <PosTableSessionPage tableId={tableId} />;
}
