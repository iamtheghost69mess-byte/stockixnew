#!/bin/bash

for conf in /etc/nginx/templates/*.conf; do
  mv $conf "/etc/nginx/sites-available/"$(basename $conf) > /dev/null
done

for template in /etc/nginx/templates/*.template; do
  # Only substitute compose build args (e.g. SERVER_PROXY_PORT). Nginx uses $host, $scheme, etc. at
  # runtime — full envsubst would erase those and break proxy_set_header (invalid number of arguments).
  envsubst '${SERVER_PROXY_PORT}' < $template > "/etc/nginx/sites-available/"$(basename $template)".conf"
done