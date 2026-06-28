# Layer 5 ProxySQL & DB Routing Audit

## 1. Database Connection Definition

- **`services/stockix-finance/packages/server/src/common/config/system-database.ts` (line 5-6)**
  - Host: `process.env.SYSTEM_DB_HOST || process.env.DB_HOST`
  - Port: `process.env.SYSTEM_DB_PORT || process.env.DB_PORT || 6033`
  - ProxySQL: Routes through ProxySQL (port 6033 by default)
  - Host type: Environment variable fallback to Docker DNS.

- **`services/stockix-finance/packages/server/src/common/config/tenant-database.ts` (line 23-24)**
  - Host: `process.env.TENANT_DB_HOST || process.env.DB_HOST`
  - Port: `process.env.TENANT_DB_PORT || process.env.DB_PORT || 6033`
  - ProxySQL: Routes through ProxySQL (port 6033 by default)
  - Host type: Environment variable fallback to Docker DNS.

- **`apps/pos-backend/config/config.js` (line 79)**
  - Connection: `const databaseURI = mongoUri ?? "mongodb://localhost:27017/pos-db";`
  - ProxySQL: No (MongoDB)
  - Host type: Hardcoded fallback `localhost`.

- **`packages/db/drizzle.config.ts` (line 12)**
  - Connection: `dbCredentials: { url: databaseUrl }` (from `apiConfig.databaseUrl`)
  - ProxySQL: No (Postgres)
  - Host type: Environment variable.

## 2. ProxySQL Configuration

- **`infra/shared/docker-compose.yml` (lines 91-132)**
  - ProxySQL admin port: 6032
  - ProxySQL query port: 6033
  - Worker to Admin Interface: Uses port 6032 via `workerProxySqlAdminHost()` (`stockix-mysql-proxy` inside docker or `127.0.0.1` if on host).
  - Tenant Services to Query Interface: Uses port 6033 (`stockix-mysql-proxy`).
  - Port mismatch: No internal mismatch. The internal ports 6032/6033 are mapped consistently.

## 3. MYSQL_PROXY_HOST / TENANT_DB_HOST Reference

- **`infra/worker-service/domain/provisioning/tenant-env.ts` (line 74)**
  - Content: `return process.env.MYSQL_PROXY_HOST ?? "stockix-mysql-proxy";`
  - Type: Docker DNS Name
  - Port type: Intended for Query port (6033)

- **`infra/worker-service/domain/provisioning/tenant-env.ts` (line 203-204)**
  - Content: 
    ```typescript
    TENANT_DB_HOST: mysqlHost,
    TENANT_DB_PORT: mysqlPort,
    ```
  - Type: Docker DNS Name (evaluates to MYSQL_PROXY_HOST)
  - Port type: Query port (6033)

- **`infra/worker-service/domain/provisioner.ts` (line 68)**
  - Content: `return infraConfig.mysqlProxyHost ?? "stockix-mysql-proxy";`
  - Type: Docker DNS Name
  - Port type: Admin port (Worker uses it for 6032 admin queries).

- **`infra/worker-service/src/env.ts` (line 31)**
  - Content: `MYSQL_PROXY_HOST: z.string()`
  - Type: Variable Definition
  - Port type: Variable Definition

## 4. Direct MySQL Connection That Bypasses ProxySQL

- **`infra/worker-service/domain/provisioner.ts` (line 400-406)**
  - Exact config:
    ```typescript
    const conn = await mysql2.createConnection({
      host: mysqlHost,
      port: 3306,
      user: "root",
      password: rootPassword,
      connectTimeout: 15_000,
    });
    ```
  - Classification: Intentional (Worker must bypass ProxySQL to execute `CREATE DATABASE` and `CREATE USER` DDL statements directly against the MySQL primary instance).

- **`infra/worker-service/domain/provisioner.ts` (line 473-479)**
  - Exact config:
    ```typescript
    const conn = await mysql2.createConnection({
      host: mysqlHost,
      port: 3306,
      user: "root",
      password: rootPassword,
      connectTimeout: 15_000,
    });
    ```
  - Classification: Intentional (Worker drops and recreates system DB).

- **`infra/worker-service/domain/provisioning/adapters/check-mysql-orphan.ts` (line 41-44)**
  - Exact config:
    ```typescript
    const connection = await mysql2.createConnection({
      host: mysqlHost,
      port: 3306,
      user: "root",
    });
    ```
  - Classification: Intentional (Audit script).

## 5. ProxySQL Sync Logic

- **`infra/worker-service/domain/provisioner.ts` (line 189-245)**
  - Block snippet:
    ```typescript
    async function registerMysqlUserInProxySql(...) {
      const proxyHost = workerProxySqlAdminHost();
      const conn = await mysql2.createConnection({
        host: proxyHost,
        port: 6032,
        user: adminUser,
        password: adminPassword,
      });
      await applyProxySqlUserSync(conn, username, password);
    }
    ```
    ```typescript
    async function applyProxySqlUserSync(conn, username, password) {
      await conn.query("DELETE FROM mysql_users WHERE username = ?", [username]);
      await conn.query(
        "INSERT INTO mysql_users (username, password, default_hostgroup, active, max_connections) VALUES (?, ?, 0, 1, 200)",
        [username, password],
      );
      await conn.query("LOAD MYSQL USERS TO RUNTIME");
      await conn.query("SAVE MYSQL USERS TO DISK");
    }
    ```
  - Port used: 6032 (Admin interface)
  - Validation: Verifies success immediately using `verifyProxySqlTenantLogin` (which connects to query port 6033).
  - Handles 'user already exists': Yes (it unconditionally issues a `DELETE FROM mysql_users` before inserting).

## 6. Tenant DB Isolation Model

- **`infra/worker-service/domain/provisioner.ts` (line 408-436)**
  - Exact SQL logic:
    ```typescript
    await conn.execute(
      `CREATE DATABASE IF NOT EXISTS \`${financeDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await conn.execute(
      `CREATE DATABASE IF NOT EXISTS \`${systemDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await conn.execute(
      `CREATE USER IF NOT EXISTS '${tenantUser}'@'%' IDENTIFIED BY ${mysqlEscape(dbPassword)}`,
    );
    await conn.execute(
      `ALTER USER '${tenantUser}'@'%' IDENTIFIED BY ${mysqlEscape(dbPassword)}`,
    );
    await conn.execute(
      `GRANT ALL PRIVILEGES ON \`${financeDb}\`.* TO '${tenantUser}'@'%'`,
    );
    await conn.execute(
      `GRANT ALL PRIVILEGES ON \`${systemDb}\`.* TO '${tenantUser}'@'%'`,
    );
    await conn.execute(
      `GRANT ALL PRIVILEGES ON \`${orgDbPattern}\`.* TO '${tenantUser}'@'%'`,
    );
    ```
  - Credentials: Every tenant receives a highly isolated, dedicated MySQL user (`tenantUser` pattern).
  - DB Naming pattern: `stockix_${mysqlSafe}_finance`, `stockix_${mysqlSafe}_system`, and wildcard grants for dynamically created org databases: `stockix_${mysqlSafe}_%`.

## 7. DB Connection in Finance Tenant Stack

- **`infra/tenant-stack/docker-compose.yml` (lines 53-71)**
  - Variables passed:
    ```yaml
      - DB_CLIENT=mysql
      - DB_HOST=${DB_HOST:-stockix-mysql-proxy}
      - DB_PORT=${DB_PORT:-6033}
      - DB_USER=${DB_USER}
      - DB_PASSWORD=${DB_PASSWORD}
    ```
  - Target: Routes to ProxySQL query interface via `stockix-mysql-proxy` (or env var injection which defaults to it).

## 8. Summary Table

| Service | DB Host | DB Port | Via ProxySQL | Issue |
|---|---|---|---|---|
| stockix-server (Finance) | `stockix-mysql-proxy` | `6033` | Yes | None |
| stockix-api | Postgres URI | Postgres | No | None (Postgres stack) |
| stockix-pos-backend | `mongodb://localhost` | `27017` | No | None (Mongo stack, localhost fallback) |
| stockix-worker (DDL) | `stockix-mysql` | `3306` | No | Intentional (DDL bypassing proxy) |
| stockix-worker (Sync) | `stockix-mysql-proxy` | `6032` | Yes | None (Proxy admin port) |
