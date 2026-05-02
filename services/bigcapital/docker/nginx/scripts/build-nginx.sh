#!/bin/bash

for conf in /etc/nginx/templates/*.conf; do
  mv $conf "/etc/nginx/sites-available/"$(basename $conf) > /dev/null
done

# Only substitute Docker build args. A bare `envsubst` also replaces nginx vars like
# $host / $scheme (empty if unset) and breaks proxy_set_header — see server.template.
#
# server.template uses Docker DNS (resolver 127.0.0.11) + variable proxy_pass so nginx
# re-resolves `server` / `webapp` on each request — mandatory when those containers get a
# new IP after restart (otherwise 502 / "No route to host" to a stale upstream).
for template in /etc/nginx/templates/*.template; do
  envsubst '${SERVER_PROXY_PORT}' < $template > "/etc/nginx/sites-available/"$(basename $template)".conf"
done