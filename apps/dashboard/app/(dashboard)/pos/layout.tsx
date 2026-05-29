import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "POS",
};

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
