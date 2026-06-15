import type { Metadata } from "next";

import { PosFloorPage } from "./_components/pos-floor-page";

export const metadata: Metadata = {
  title: "Floor",
  description: "POS tables",
};

export default function PosHomePage() {
  return <PosFloorPage />;
}
