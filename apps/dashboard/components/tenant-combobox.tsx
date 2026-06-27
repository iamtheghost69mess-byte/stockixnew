"use client";

import * as React from "react";
import { useMemo, useState, useEffect } from "react";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "@repo/ui/combobox";

type TenantResult = {
  tenantId: string;
  name: string;
  slug: string;
};

interface TenantComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
}

export function TenantCombobox({ value, onValueChange }: TenantComboboxProps) {
  const [inputValue, setInputValue] = useState("");
  const [tenants, setTenants] = useState<TenantResult[]>([]);
  const [loading, setLoading] = useState(false);

  // Debounce the input value
  const [debouncedInput, setDebouncedInput] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedInput(inputValue);
    }, 300);
    return () => clearTimeout(timer);
  }, [inputValue]);

  // Fetch tenants
  useEffect(() => {
    let active = true;

    async function fetchTenants() {
      setLoading(true);
      try {
        const query = new URLSearchParams({
          page: "1",
          pageSize: "50",
          search: debouncedInput,
        });
        const res = await fetch(`/api/tenants?${query}`);
        if (!res.ok) throw new Error("Failed to fetch tenants");
        const data = await res.json();
        if (active) {
          setTenants(data.tenants || []);
        }
      } catch (err) {
        if (active) setTenants([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    void fetchTenants();
    return () => {
      active = false;
    };
  }, [debouncedInput]);

  // Ensure the selected tenant is in the list if it's set from outside or not currently visible
  const [selectedTenant, setSelectedTenant] = useState<TenantResult | null>(null);

  useEffect(() => {
    if (!value) {
      setSelectedTenant(null);
      return;
    }
    // If the value changed, and we don't have it in our list, we might want to fetch it specifically.
    // For now, if we have it in our list, use that.
    const found = tenants.find((t) => t.tenantId === value);
    if (found) {
      setSelectedTenant(found);
    }
  }, [value, tenants]);

  // When value changes, update the internal input text to the tenant name, if we know it.
  useEffect(() => {
    if (!value) {
      setInputValue("");
    } else if (selectedTenant) {
      setInputValue(selectedTenant.name);
    }
  }, [value, selectedTenant]);

  return (
    <Combobox
      value={value}
      onValueChange={(val) => {
        const v = Array.isArray(val) ? val[0] : val;
        onValueChange(v || "");
      }}
    >
      <ComboboxInput
        placeholder="Search tenants..."
        value={inputValue}
        onValueChange={setInputValue}
        showClear={!!value}
      />
      <ComboboxContent>
        <ComboboxEmpty>
          {loading ? "Searching..." : "No tenants found."}
        </ComboboxEmpty>
        <ComboboxList>
          {tenants.map((t) => (
            <ComboboxItem key={t.tenantId} value={t.tenantId} label={t.name}>
              {t.name} <span className="text-muted-foreground ml-2">({t.slug})</span>
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
