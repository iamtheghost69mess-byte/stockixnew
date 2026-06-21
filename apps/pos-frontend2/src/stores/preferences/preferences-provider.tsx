"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

import { useTheme } from "next-themes";
import { type StoreApi, useStore } from "zustand";

import { type FontKey, fontRegistry } from "@/lib/fonts/registry";
import {
  CONTENT_LAYOUT_VALUES,
  NAVBAR_STYLE_VALUES,
  SIDEBAR_COLLAPSIBLE_VALUES,
  SIDEBAR_VARIANT_VALUES,
} from "@/lib/preferences/layout";
import { THEME_MODE_VALUES, THEME_PRESET_VALUES, type ThemeMode } from "@/lib/preferences/theme";

import { createPreferencesStore, type PreferencesState } from "./preferences-store";

const PreferencesStoreContext = createContext<StoreApi<PreferencesState> | null>(null);

const FONT_VALUES = Object.keys(fontRegistry) as FontKey[];

function getSafeValue<T extends string>(raw: string | null, allowed: readonly T[]): T | undefined {
  if (!raw) return undefined;
  return allowed.includes(raw as T) ? (raw as T) : undefined;
}

function readDomState(): Partial<PreferencesState> {
  const root = document.documentElement;

  const themeModeAttr = getSafeValue(root.getAttribute("data-theme-mode"), THEME_MODE_VALUES);
  const resolvedMode = root.classList.contains("dark") ? "dark" : "light";

  return {
    themeMode: themeModeAttr ?? resolvedMode,
    resolvedThemeMode: resolvedMode,
    themePreset: getSafeValue(root.getAttribute("data-theme-preset"), THEME_PRESET_VALUES),
    font: getSafeValue(root.getAttribute("data-font"), FONT_VALUES),
    contentLayout: getSafeValue(root.getAttribute("data-content-layout"), CONTENT_LAYOUT_VALUES),
    navbarStyle: getSafeValue(root.getAttribute("data-navbar-style"), NAVBAR_STYLE_VALUES),
    sidebarVariant: getSafeValue(root.getAttribute("data-sidebar-variant"), SIDEBAR_VARIANT_VALUES),
    sidebarCollapsible: getSafeValue(root.getAttribute("data-sidebar-collapsible"), SIDEBAR_COLLAPSIBLE_VALUES),
  };
}

export const PreferencesStoreProvider = ({
  children,
  themeMode,
  themePreset,
  font,
  contentLayout,
  navbarStyle,
}: {
  children: React.ReactNode;
  themeMode: PreferencesState["themeMode"];
  themePreset: PreferencesState["themePreset"];
  font: PreferencesState["font"];
  contentLayout: PreferencesState["contentLayout"];
  navbarStyle: PreferencesState["navbarStyle"];
}) => {
  const [store] = useState<StoreApi<PreferencesState>>(() =>
    createPreferencesStore({
      themeMode,
      themePreset,
      font,
      contentLayout,
      navbarStyle,
    }),
  );
  const { theme, resolvedTheme, setTheme } = useTheme();

  const domSnapshotRef = useRef<Partial<PreferencesState> | null>(null);

  useEffect(() => {
    const domState = readDomState();
    domSnapshotRef.current = domState;

    store.setState((prev) => ({
      ...prev,
      ...domState,
      isSynced: true,
    }));
  }, [store]);

  useEffect(() => {
    const currentStoreThemeMode = store.getState().themeMode;
    const nextThemeMode = theme && THEME_MODE_VALUES.includes(theme as ThemeMode) ? (theme as ThemeMode) : currentStoreThemeMode;

    document.documentElement.setAttribute("data-theme-mode", nextThemeMode);

    if (currentStoreThemeMode !== nextThemeMode) {
      store.setState((prev) => ({ ...prev, themeMode: nextThemeMode }));
    }

    const resolvedMode = resolvedTheme === "dark" ? "dark" : "light";
    if (store.getState().resolvedThemeMode !== resolvedMode) {
      store.setState((prev) => ({ ...prev, resolvedThemeMode: resolvedMode }));
    }
  }, [resolvedTheme, store, theme]);

  useEffect(() => {
    const unsubscribeStore = store.subscribe((state, prev) => {
      if (state.themeMode !== prev.themeMode) {
        document.documentElement.setAttribute("data-theme-mode", state.themeMode);
        if (theme !== state.themeMode) {
          setTheme(state.themeMode);
        }
      }
    });

    return unsubscribeStore;
  }, [setTheme, store, theme]);

  return <PreferencesStoreContext.Provider value={store}>{children}</PreferencesStoreContext.Provider>;
};

export const usePreferencesStore = <T,>(selector: (state: PreferencesState) => T): T => {
  const store = useContext(PreferencesStoreContext);
  if (!store) throw new Error("Missing PreferencesStoreProvider");
  return useStore(store, selector);
};
