import type { ReactNode } from "react";

import type { Metadata } from "next";

import { PosQueryProviders } from "@/components/pos/pos-query-providers";
import { PosRootGate } from "@/components/pos/pos-root-gate";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_CONFIG } from "@/config/app-config";
import { fontVars } from "@/lib/fonts/registry";
import { PREFERENCE_DEFAULTS } from "@/lib/preferences/preferences-config";
import { PreferencesStoreProvider } from "@/stores/preferences/preferences-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: APP_CONFIG.meta.title,
  description: APP_CONFIG.meta.description,
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { theme_mode, theme_preset, content_layout, navbar_style, sidebar_variant, sidebar_collapsible, font } =
    PREFERENCE_DEFAULTS;
  return (
    <html
      lang="en"
      data-theme-mode={theme_mode}
      data-theme-preset={theme_preset}
      data-content-layout={content_layout}
      data-navbar-style={navbar_style}
      data-sidebar-variant={sidebar_variant}
      data-sidebar-collapsible={sidebar_collapsible}
      data-font={font}
      suppressHydrationWarning
    >
      <body className={`${fontVars} min-h-screen antialiased`} suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme={theme_mode} enableSystem disableTransitionOnChange>
          <TooltipProvider>
            <PreferencesStoreProvider
              themeMode={theme_mode}
              themePreset={theme_preset}
              contentLayout={content_layout}
              navbarStyle={navbar_style}
              font={font}
            >
              <PosQueryProviders>
                <PosRootGate>{children}</PosRootGate>
              </PosQueryProviders>
              <Toaster />
            </PreferencesStoreProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
