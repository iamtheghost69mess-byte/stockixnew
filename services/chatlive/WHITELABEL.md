# White-Label Changes Applied (Stockix / Chatlive)

Visual-only branding for the Chatwoot fork at `services/chatlive`. Functionality is unchanged.

## Brand Name

| Mechanism | Details |
|-----------|---------|
| **Default install config** | `config/installation_config.yml` — `INSTALLATION_NAME=Stockix`, empty `BRAND_NAME` (hides widget attribution) |
| **Runtime env override** | `BrandingEnvOverrides` concern on dashboard, widget, survey, portal, and mailer controllers |
| **UI substitution** | Existing `useBranding().replaceInstallationName()` replaces `Chatwoot` in i18n strings when `installationName` ≠ `Chatwoot` |
| **Custom-brand mode** | `isACustomBrandedInstance` when `installationName !== 'Chatwoot'` — hides docs, changelog, Chatwoot support links |

**Files touched:** `config/installation_config.yml`, `enterprise/config/premium_installation_config.yml`, `app/controllers/concerns/branding_env_overrides.rb`, `app/controllers/dashboard_controller.rb`, `widgets_controller.rb`, `api/v1/widget/configs_controller.rb`, `survey/responses_controller.rb`, `public/api/v1/portals/base_controller.rb`, `app/mailers/application_mailer.rb`, `app/views/layouts/mailer/base.liquid`, `config/locales/en.yml`

## Logo

| Asset | Path |
|-------|------|
| **Source of truth** | `apps/dashboard/components/logo.tsx` → exported as `apps/dashboard/public/stockix-logo.svg` |
| **Dashboard / login** | `public/brand-assets/logo.svg`, `logo_dark.svg` |
| **Favicon / PWA** | `public/brand-assets/logo_thumbnail.svg` |
| **PWA manifest** | `public/manifest.json` (name: Stockix, Stockix theme colors) |

Chatwoot default Chatwoot SVG wordmarks in `public/brand-assets/` were replaced. Filenames are unchanged so existing references keep working.

## Removed / Hidden External Chatwoot Branding

| Item | Approach |
|------|----------|
| Sidebar Docs / Changelog | Hidden via `CustomBrandPolicyWrapper` when `INSTALLATION_NAME` ≠ `Chatwoot` |
| Changelog API | `shared/constants/links.js` — `CHANGELOG_API_URL` cleared |
| Widget “Powered by” | Empty default `BRAND_NAME`; `Branding.vue` only renders when `brandName` is set |
| Identity validation docs link | `ConfigurationPage.vue` — uses `helpCenterURL` / `hostURL`, hidden if unset |
| Default PWA icons | `DISPLAY_MANIFEST=false` — uses `LOGO_THUMBNAIL` for favicon in layout |

**Not changed (stories/specs/fixtures only):** `*.story.vue`, `specs/`, test fixtures with `@chatwoot.com` emails.

## Email Templates

- **From header:** `ApplicationMailer` uses `INSTALLATION_NAME` + `MAILER_SENDER_EMAIL`
- **Footer brand:** `base.liquid` falls back to `INSTALLATION_NAME`, then `Stockix`

## Docker / Production

`infra/prod/docker-compose.yml` **chatwoot** service now **builds** from `services/chatlive` (`stockix-chatlive:local`) instead of `chatwoot/chatwoot:latest`.

## Env Vars Required

Set in root `.env` and `infra/prod/.env` (see `.env.example`):

```env
CHATWOOT_INSTALLATION_NAME=Stockix
CHATWOOT_BRAND_NAME=
CHATWOOT_BRAND_URL=
CHATWOOT_WIDGET_BRAND_URL=
CHATWOOT_LOGO_URL=/brand-assets/logo.svg
CHATWOOT_LOGO_DARK_URL=/brand-assets/logo_dark.svg
CHATWOOT_LOGO_THUMBNAIL_URL=/brand-assets/logo_thumbnail.svg
CHATWOOT_DISPLAY_MANIFEST=false
CHATWOOT_HELPCENTER_URL=
CHATWOOT_FRONTEND_URL=https://chat.yourdomain.com
MAILER_SENDER_EMAIL=noreply@yourdomain.com
```

Rails container env names (mapped in compose): `INSTALLATION_NAME`, `BRAND_NAME`, `LOGO`, `LOGO_DARK`, `LOGO_THUMBNAIL`, `BRAND_URL`, `WIDGET_BRAND_URL`, `DISPLAY_MANIFEST`, `HELPCENTER_URL`.

## Configurable vs Code (Summary)

| Setting | Env / Super Admin | Code default |
|---------|-------------------|--------------|
| Installation name | `INSTALLATION_NAME` | `Stockix` in YAML |
| Widget powered-by | `BRAND_NAME` (empty = hidden) | empty |
| Logos | `LOGO`, `LOGO_DARK`, `LOGO_THUMBNAIL` or Super Admin | Stockix SVGs |
| Terms / privacy URLs | `TERMS_URL`, `PRIVACY_URL` | empty (signup uses globalConfig) |
| Help center docs | `HELPCENTER_URL` | — |
| Mail from | `MAILER_SENDER_EMAIL` | Stockix name via `INSTALLATION_NAME` |

## Remaining (runtime / admin)

- **Existing DB installs** may still have `Chatwoot` in `installation_configs` until env overrides apply or Super Admin → Installation Config is updated.
- **Per-account logo** can still be set under Settings → Account Settings.
- **Non-English locales** still contain the string `Chatwoot` in JSON/YAML; English UI uses `replaceInstallationName` where wired.

## Build and Verify

```bash
docker build -t stockix-chatlive:local -f services/chatlive/docker/Dockerfile services/chatlive/
docker compose -f infra/prod/docker-compose.yml --env-file infra/prod/.env up -d chatwoot-postgres chatwoot-redis
docker compose -f infra/prod/docker-compose.yml --env-file infra/prod/.env run --rm chatwoot bundle exec rails db:chatwoot_prepare   # first time
CHATWOOT_FRONTEND_URL=http://localhost:3200 docker compose -f infra/prod/docker-compose.yml --env-file infra/prod/.env up -d chatwoot
```

Open **http://localhost:3200**. See **`README.md`** (Stockix local testing) for Windows Docker port binding, stop/reset, and platform `.env` wiring.

Manual checklist: browser title, favicon, login logo, sidebar logo, no `chatwoot.com` links, no widget powered-by, email sender name, PWA name.
