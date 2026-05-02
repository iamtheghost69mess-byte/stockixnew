#!/bin/bash

for conf in /etc/nginx/templates/*.conf; do
  mv $conf "/etc/nginx/sites-available/"$(basename $conf) > /dev/null
done

# Only substitute Docker build args. A bare `envsubst` also replaces nginx vars like
# $host / $scheme (empty if unset) and breaks proxy_set_header — see server.template.
for template in /etc/nginx/templates/*.template; do
  envsubst '${SERVER_PROXY_PORT}' < $template > "/etc/nginx/sites-available/"$(basename $template)".conf"
done