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

const COMMON_ACTIONS = [
  "tenant.provision",
  "tenant.suspend",
  "tenant.resume",
  "tenant.delete",
  "tenant.config_updated",
  "tenant.modules_updated",
  "owner.create",
  "owner.invite",
  "owner.invite_resend",
  "owner.delete",
  "owner.role_changed",
  "owner.status_changed",
  "owner.profile_updated",
  "license.create",
  "license.activate",
  "api_key.create",
  "api_key.revoke",
  "auth.login",
  "auth.logout",
  "mfa.enable",
  "mfa.disable"
];

interface ActionComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
}

export function ActionCombobox({ value, onValueChange }: ActionComboboxProps) {
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    if (!value) {
      setInputValue("");
    } else {
      setInputValue(value);
    }
  }, [value]);

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
        placeholder="e.g. tenant.suspend, license"
        showClear={!!value}
      />
      <ComboboxContent>
        <ComboboxEmpty>No actions match.</ComboboxEmpty>
        <ComboboxList>
          {COMMON_ACTIONS.map((action) => (
            <ComboboxItem key={action} value={action}>
              {action}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
