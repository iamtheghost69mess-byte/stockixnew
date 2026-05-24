"use client";

import { useEffect, useState } from "react";

const SESSION_KEY = "pms-tenant-id";

export function usePmsTenant() {
  const [tenantId, setTenantIdState] = useState("");

  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) setTenantIdState(saved);
  }, []);

  function setTenantId(id: string) {
    sessionStorage.setItem(SESSION_KEY, id);
    setTenantIdState(id);
  }

  return { tenantId, setTenantId };
}
