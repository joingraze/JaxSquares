#!/usr/bin/env bash
# Watches jaxsquares.com go live, for the Domain watch workflow. Every minute
# (up to WATCH_MINUTES) it logs what changed: the registry's nameservers for
# the domain, the Cloudflare zone's status, https://$DOMAIN/api/health and the
# www redirect. When the zone turns active it runs custom-domain.sh once (attach
# the Worker, add the www redirect; the log says what the token can't do).
# Exits 0 once the site serves the app and www redirects to it.
set -uo pipefail

DOMAIN="${DOMAIN:-jaxsquares.com}"
WATCH_MINUTES="${WATCH_MINUTES:-170}"
CF=https://api.cloudflare.com/client/v4

api() { curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" "$@"; }
say() { echo "$(date -u +%H:%M:%SZ) $*"; }

last=""
attached_try=0
for minute in $(seq 1 "$WATCH_MINUTES"); do
  # The .com registry's delegation: changes as soon as Squarespace saves the nameservers.
  ns=$(dig +short NS "$DOMAIN" @a.gtld-servers.net +norec 2>/dev/null | sort | tr '\n' ' ')
  [ -n "$ns" ] || ns=$(dig +noall +authority NS "$DOMAIN" @a.gtld-servers.net 2>/dev/null | awk '{print $5}' | sort | tr '\n' ' ')
  zone=$(api "$CF/zones?name=$DOMAIN" | jq -r '.result[0].status // "none"')
  health=$(curl -s -m 10 "https://$DOMAIN/api/health" | grep -q '"ok":true' && echo ok || echo no)
  www=$(curl -s -m 10 -o /dev/null -w '%{http_code} %{redirect_url}' "https://www.$DOMAIN/" || echo "error")
  state="nameservers=[$ns] zone=$zone app=$health www=$www"
  if [ "$state" != "$last" ]; then
    say "$state"
    echo "::notice ::$state"
    last="$state"
  fi
  if [ "$zone" = "active" ] && [ "$health" != "ok" ] && [ "$attached_try" -eq 0 ]; then
    say "Zone is active: connecting the Worker (custom-domain.sh)."
    bash "$(dirname "$0")/custom-domain.sh" | sed 's/^/    /'
    attached_try=1
  fi
  if [ "$health" = "ok" ] && echo "$www" | grep -q "^30[18] https://$DOMAIN/"; then
    say "Live: https://$DOMAIN serves the app and www redirects to it."
    exit 0
  fi
  sleep 60
done
say "Stopped after $WATCH_MINUTES minutes; last state: $last"
