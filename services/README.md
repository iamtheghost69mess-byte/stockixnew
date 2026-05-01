# Services

## BigCapital (`bigcapital/`)

This directory contains a **vendored copy** of upstream [BigCapital](https://github.com/bigcapitalhq/bigcapital) (not a git submodule).

**Pinned revision:** tag `v0.9.9`, commit `485138344c6b266c2034214d6f1233259adf6c32`.

Stockix **does not** embed BigCapital into Next.js apps. The control plane (`apps/api`, `apps/dashboard`) will orchestrate tenants **around** this runtime using APIs and automation you add later—not by importing BigCapital source from `apps/*`.

To track your own changes, add a **GitHub fork** as a remote only if you use git inside this folder; the Stockix repo stores BigCapital as normal files so the whole tree is versioned with Stockix.

### Run BigCapital

Follow BigCapital’s own documentation (Docker, env, database) in `services/bigcapital/README.md` and [their docs](https://docs.bigcapital.app/). Stockix does not replace that setup.

### Updating the vendored version

Replace the contents of `services/bigcapital` with a fresh export from upstream at the desired tag/commit, then commit the diff in Stockix. Prefer doing this in a dedicated PR because the change set can be large.

## Boundary

| Area | Location |
|------|----------|
| Stockix product code | `apps/*`, `packages/*` |
| BigCapital upstream copy | `services/bigcapital` only |
