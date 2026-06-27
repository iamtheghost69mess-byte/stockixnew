"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "@repo/ui/combobox";

type ActorResult = {
  id: string;
  name: string;
  email: string;
  roleName: string;
};

interface ActorComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
}

export function ActorCombobox({ value, onValueChange }: ActorComboboxProps) {
  const [inputValue, setInputValue] = useState("");
  const [actors, setActors] = useState<ActorResult[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch all actors once on mount
  useEffect(() => {
    let active = true;

    async function fetchActors() {
      setLoading(true);
      try {
        const res = await fetch("/api/owners");
        if (!res.ok) throw new Error("Failed to fetch actors");
        const data = await res.json();
        if (active) {
          setActors(data.owners || []);
        }
      } catch (err) {
        if (active) setActors([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    void fetchActors();
    return () => {
      active = false;
    };
  }, []);

  const [selectedActor, setSelectedActor] = useState<ActorResult | null>(null);

  useEffect(() => {
    if (!value) {
      setSelectedActor(null);
      return;
    }
    const found = actors.find((a) => a.id === value);
    if (found) {
      setSelectedActor(found);
    }
  }, [value, actors]);

  useEffect(() => {
    if (!value) {
      setInputValue("");
    } else if (selectedActor) {
      setInputValue(selectedActor.name || selectedActor.email);
    }
  }, [value, selectedActor]);

  return (
    <Combobox
      value={value}
      onValueChange={(val) => {
        const v = Array.isArray(val) ? val[0] : val;
        onValueChange(v || "");
      }}
      inputValue={inputValue}
      onInputValueChange={setInputValue}
    >
      <ComboboxInput
        placeholder="Search actors..."
        showClear={!!value}
      />
      <ComboboxContent>
        <ComboboxEmpty>
          {loading ? "Loading..." : "No actors found."}
        </ComboboxEmpty>
        <ComboboxList>
          {actors.map((a) => (
            <ComboboxItem key={a.id} value={a.id} label={a.name || a.email}>
              {a.name} <span className="text-muted-foreground ml-2">({a.email})</span>
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
