"use client";

import { usePrintJobListener } from "@/hooks/usePrintJobListener";

export function PosPrintJobListener() {
  usePrintJobListener();
  return null;
}
