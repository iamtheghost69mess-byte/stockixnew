// ═══════════════════════════════════════════════════════════════
// PM2 Ecosystem — Frontend services only (pre-built in CI)
// Backend runs in Docker (see docker-compose.production.yml)
// ═══════════════════════════════════════════════════════════════

module.exports = {
  apps: [
    {
      name: "studio-admin",
      cwd: "./apps/pos-frontend2",
      script: "node_modules/.bin/next",
      args: "start --port 3000",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      max_memory_restart: "512M",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "/home/deploy/logs/studio-admin-error.log",
      out_file: "/home/deploy/logs/studio-admin-out.log",
      merge_logs: true,
    },
    {
      name: "saas-dash",
      cwd: "./apps/saas-dash",
      script: "node_modules/.bin/next",
      args: "start --port 3010",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3010,
      },
      max_memory_restart: "512M",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "/home/deploy/logs/saas-dash-error.log",
      out_file: "/home/deploy/logs/saas-dash-out.log",
      merge_logs: true,
    },
  ],
};
