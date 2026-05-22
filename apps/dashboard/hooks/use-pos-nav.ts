"use client";

import { useEffect, useState } from "react";

export function usePosNavVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/pos/status");
        const data = (await res.json()) as { configured?: boolean };
        setVisible(Boolean(data.configured));
      } catch {
        setVisible(false);
      }
    })();
  }, []);

  return visible;
}
