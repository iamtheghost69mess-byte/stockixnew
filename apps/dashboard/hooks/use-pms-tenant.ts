"use client";

import { useEffect, useState } from "react";

const ID_KEY = "pms-tenant-id";
const NAME_KEY = "pms-tenant-name";
const SLUG_KEY = "pms-tenant-slug";

export function usePmsTenant() {
  const [tenantId, setTenantIdState] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const savedId = sessionStorage.getItem(ID_KEY) ?? "";
    const savedName = sessionStorage.getItem(NAME_KEY) ?? "";
    const savedSlug = sessionStorage.getItem(SLUG_KEY) ?? "";
    setTenantIdState(savedId);
    setTenantName(savedName);
    setTenantSlug(savedSlug);
    setReady(true);
  }, []);

  function setTenantId(id: string, name?: string, slug?: string) {
    sessionStorage.setItem(ID_KEY, id);
    if (name) sessionStorage.setItem(NAME_KEY, name);
    if (slug) sessionStorage.setItem(SLUG_KEY, slug);
    setTenantIdState(id);
    if (name) setTenantName(name);
    if (slug) setTenantSlug(slug);
  }

  return { tenantId, tenantName, tenantSlug, setTenantId, ready };
}
