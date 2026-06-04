# MySQL Init

This directory is mounted into `stockix-mysql` at `/docker-entrypoint-initdb.d` (read-only).

Place `.sql` or `.sh` files here for **one-time** initialization when the MySQL data volume is first created.

Currently empty — tenant databases are created dynamically by the infra-worker provisioner (`infra/worker-service/domain/provisioner.ts`).

Do **not** add tenant-specific SQL here. Charset and collation defaults are set via `command:` flags in `infra/shared/docker-compose.yml`.
