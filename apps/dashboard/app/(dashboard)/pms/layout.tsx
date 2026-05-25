import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PMS",
};

export default function PmsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
