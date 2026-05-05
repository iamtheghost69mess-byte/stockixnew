"use client";

import { useEffect, useState } from "react";

type Me = { id: string; role: string; email: string; name: string };

let cachedMe: Me | null = null;
let requested = false;

export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(cachedMe);

  useEffect(() => {
    if (requested) return;
    requested = true;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.id) {
          cachedMe = data as Me;
          setMe(cachedMe);
        }
      })
      .catch(() => null);
  }, []);

  return me;
}
