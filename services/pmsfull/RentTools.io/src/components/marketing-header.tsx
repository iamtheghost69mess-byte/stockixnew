"use client";

import Link from "next/link";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { useI18n } from "@/lib/i18n/context";
import { useSession } from "@/lib/session-context";
import { StockixLogo } from "@/components/stockix-logo";

interface MarketingHeaderProps {
  /** Sticky variant for long-content pages (blog post + index). Off by
   *  default so the home page and onboarding wizard match. */
  sticky?: boolean;
}

const NAV_LABELS = {
  en: { blog: "Blog", signIn: "Sign in", getStarted: "Get started", dashboard: "Dashboard" },
  ru: { blog: "Блог", signIn: "Войти", getStarted: "Начать", dashboard: "Панель" },
  de: { blog: "Blog", signIn: "Anmelden", getStarted: "Loslegen", dashboard: "Dashboard" },
  fr: { blog: "Blog", signIn: "Se connecter", getStarted: "Commencer", dashboard: "Tableau de bord" },
  es: { blog: "Blog", signIn: "Iniciar sesión", getStarted: "Comenzar", dashboard: "Panel" },
};

/**
 * Public-marketing header — used on the home page, /onboard, /blog, and
 * /blog/[slug]. Identical brand mark + nav across all four so a visitor
 * never sees the chrome change while bouncing between them.
 *
 * Brand mark: animated coral pill + house silhouette + three SMIL smoke
 * puffs from the chimney. Same SVG that ships in the home-page header.
 *
 * Nav: Blog · GitHub · Sign in · Get started · ThemeToggle · LocaleSwitcher.
 * GitHub + Get started both hide on <sm to keep the small-screen header
 * to a single readable row.
 */
export function MarketingHeader({ sticky = false }: MarketingHeaderProps) {
  const { locale } = useI18n();
  const session = useSession();
  const t = NAV_LABELS[locale];
  const isAuthenticated = session !== null;
  // Locale-aware href helper — internal links must point at the
  // locale-prefixed URL when the user is in a non-default locale,
  // otherwise the middleware would 308-redirect every click. Prefixing
  // here lets the navigation hit the final URL on the first request.
  // Pages outside LOCALIZABLE_PATHS (e.g. /dashboard) stay unprefixed
  // because the middleware would redirect /<locale>/dashboard back to
  // /dashboard anyway.
  const NON_LOCALIZED_TARGETS = new Set(["/dashboard"]);
  const localized = (href: string): string => {
    if (locale === "en") return href;
    if (NON_LOCALIZED_TARGETS.has(href)) return href;
    if (href === "/") return `/${locale}`;
    return `/${locale}${href}`;
  };
  return (
    <header
      className={
        sticky
          ? "sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--bg)]/85 backdrop-blur-md"
          : "border-b border-[var(--line)]"
      }
    >
      <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-6 sm:py-4">
        <Link href={localized("/")} className="group flex shrink-0 items-center gap-2 min-w-0 text-[var(--ink)]">
          <StockixLogo className="h-5 w-auto shrink-0" />
          <span className="display text-[17px] font-semibold tracking-tight">PMS</span>
        </Link>

        {/* Right cluster — uses shrink-0 + whitespace-nowrap on every
            child so the auth labels never wrap onto a second line at
            ~375px (previously "Sign in" wrapped to two lines because
            the cluster ran out of space). The Blog link is hidden on
            the smallest viewports — the brand mark + the primary CTA
            + the chrome (theme/locale) win precedence over a
            discoverable nav link the user can still reach via the
            footer or the dashboard side panel. */}
        <nav className="flex shrink-0 items-center gap-0.5 sm:gap-2">
          <Link
            href={localized("/blog")}
            className="hidden whitespace-nowrap rounded-md px-2 py-1.5 text-[13px] text-[var(--ink-3)] transition-colors hover:bg-[var(--bg-2)] hover:text-[var(--ink)] sm:inline-flex sm:px-3"
          >
            {t.blog}
          </Link>
          {isAuthenticated ? (
            // Already signed in — collapse Sign in + Get started into a
            // single Dashboard button. Anything else is the wrong call:
            // showing Sign in to a signed-in user is confusing, and a
            // separate Sign out belongs in the dashboard chrome (where
            // the user is when they want to leave), not in marketing
            // header that they hit while exploring blog/onboard pages.
            <Link
              href={localized("/dashboard")}
              className="whitespace-nowrap rounded-md bg-[var(--ink)] px-2.5 py-1.5 text-[13px] font-medium text-[var(--bg)] transition-colors hover:bg-[var(--ink-2)] sm:px-3"
            >
              {t.dashboard}
            </Link>
          ) : (
            <>
              <Link
                href={localized("/login")}
                className="whitespace-nowrap rounded-md px-2 py-1.5 text-[13px] text-[var(--ink-3)] transition-colors hover:bg-[var(--bg-2)] hover:text-[var(--ink)] sm:px-3"
              >
                {t.signIn}
              </Link>
              <Link
                href={localized("/onboard")}
                className="hidden whitespace-nowrap rounded-md bg-[var(--ink)] px-3 py-1.5 text-[13px] font-medium text-[var(--bg)] transition-colors hover:bg-[var(--ink-2)] sm:inline-flex"
              >
                {t.getStarted}
              </Link>
            </>
          )}
          {/* Divider hidden on mobile — every pixel matters and the
              auth pill / locale switcher already provide visual
              separation via their own borders. */}
          <span className="mx-1 hidden h-4 w-px bg-[var(--line)] sm:block" />
          <ThemeToggle />
          <LocaleSwitcher />
        </nav>
      </div>
    </header>
  );
}
