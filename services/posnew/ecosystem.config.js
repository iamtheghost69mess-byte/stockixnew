module.exports = {
  apps: [
    {
      name: "pos-studio",
      script: "npm",
      args: "start",
      cwd: "./apps/pos-frontend2",
      env: {
        PORT: 3000,
        NODE_ENV: "production",
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "~/.pm2/logs/pos-studio-error.log",
      out_file: "~/.pm2/logs/pos-studio-out.log",
      merge_logs: true,
      autorestart: true,
      max_memory_restart: "1G",
    },
    {
      name: "saas-dash",
      script: "npm",
      args: "start",
      cwd: "./apps/saas-dash",
      env: {
        PORT: 3010,
        NODE_ENV: "production",
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "~/.pm2/logs/saas-dash-error.log",
      out_file: "~/.pm2/logs/saas-dash-out.log",
      merge_logs: true,
      autorestart: true,
      max_memory_restart: "1G",
    },
  ],
};
