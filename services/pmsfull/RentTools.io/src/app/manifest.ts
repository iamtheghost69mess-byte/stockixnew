import type { MetadataRoute } from "next";
import { getLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/translations";

const LOCALIZED: Record<Locale, { name: string; description: string; lang: string }> = {
  en: {
    name: "Stockix PMS",
    description: "Property Management System by Stockix",
    lang: "en",
  },
  ru: {
    name: "Stockix PMS",
    description: "Система управления недвижимостью от Stockix",
    lang: "ru",
  },
  de: {
    name: "Stockix PMS",
    description: "Immobilienverwaltung von Stockix",
    lang: "de",
  },
  fr: {
    name: "Stockix PMS",
    description: "Système de gestion immobilière par Stockix",
    lang: "fr",
  },
  es: {
    name: "Stockix PMS",
    description: "Sistema de gestión de propiedades de Stockix",
    lang: "es",
  },
};

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const locale = await getLocale();
  const copy = LOCALIZED[locale];
  return {
    name: copy.name,
    short_name: "Stockix",
    description: copy.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    theme_color: "#000000",
    background_color: "#ffffff",
    lang: copy.lang,
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
