# Infrastructure

Reserved for **Docker Compose**, **Traefik** (or another reverse proxy), and deployment wiring between:

- Stockix control plane (`apps/dashboard`, `apps/api`)
- BigCapital runtime (`services/bigcapital`)

No compose or proxy configuration lives here yet. Add it when you define tenant networking and host routing.
