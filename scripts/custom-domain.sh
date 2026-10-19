#!/usr/bin/env bash
# Connects jaxsquares.com to the Worker, run by the Deploy workflow after each
# deploy (never failing it). It prints the domain's public DNS, then:
#   - no Cloudflare zone for the domain yet: says to add it (docs/domain.md);
#   - zone pending: prints the two nameservers to set at the registrar;
#   - zone active: attaches the domain to the Worker as a Custom Domain
#     (idempotent) and checks https://$DOMAIN/api/health.
# Needs CLOUDFLARE_API_TOKEN; reading zones needs Zone:Read on the token and
# attaching needs Workers Scripts:Edit plus Workers Routes:Edit on the zone. A
# missing permission is reported, not fatal: attach in the dashboard instead.
set -uo pipefail

DOMAIN="${DOMAIN:-jaxsquares.com}"
SERVICE="${SERVICE:-jaxsquares}"
CF=https://api.cloudflare.com/client/v4

api() { curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" "$@"; }

echo "== Public DNS for $DOMAIN"
for type in NS A AAAA MX TXT DS; do
  echo "-- $type: $(dig +short "$DOMAIN" "$type" | tr '\n' ' ')"
done
echo "-- www: $(dig +short "www.$DOMAIN" CNAME | tr '\n' ' ') $(dig +short "www.$DOMAIN" A | tr '\n' ' ')"

echo "== Cloudflare"
account=$(api "$CF/accounts" | jq -r '.result[0].id // empty')
zones=$(api "$CF/zones?name=$DOMAIN")
if [ "$(echo "$zones" | jq -r '.success')" != "true" ]; then
  echo "::warning ::The API token can't read zones: $(echo "$zones" | jq -c '.errors')."
  echo "Give it Zone:Read (and Workers Routes:Edit) or attach $DOMAIN in the dashboard: Workers & Pages > $SERVICE > Settings > Domains & Routes > Add > Custom domain."
  exit 0
fi
zone_id=$(echo "$zones" | jq -r '.result[0].id // empty')
status=$(echo "$zones" | jq -r '.result[0].status // empty')
if [ -z "$zone_id" ]; then
  echo "::notice ::$DOMAIN isn't in this Cloudflare account yet. Add it (Free plan), then set the nameservers it gives you at the registrar. See docs/domain.md."
  exit 0
fi
echo "Zone $DOMAIN: $status"
echo "Cloudflare nameservers: $(echo "$zones" | jq -r '.result[0].name_servers | join(", ")')"
echo "Nameservers before Cloudflare: $(echo "$zones" | jq -r '(.result[0].original_name_servers // []) | join(", ")')"
if [ "$status" != "active" ]; then
  echo "::notice ::$DOMAIN is $status on Cloudflare: set its nameservers at the registrar to $(echo "$zones" | jq -r '.result[0].name_servers | join(" and ")') (turn DNSSEC off there first)."
  exit 0
fi

echo "== Attaching $DOMAIN to the $SERVICE Worker"
attached=$(api -X PUT "$CF/accounts/$account/workers/domains" \
  -d "{\"environment\":\"production\",\"hostname\":\"$DOMAIN\",\"service\":\"$SERVICE\",\"zone_id\":\"$zone_id\"}")
echo "$attached" | jq -c '{success, errors, hostname: .result.hostname, service: .result.service}'
if [ "$(echo "$attached" | jq -r '.success')" != "true" ]; then
  echo "::warning ::Couldn't attach $DOMAIN with this token. Attach it in the dashboard: Workers & Pages > $SERVICE > Settings > Domains & Routes > Add > Custom domain."
  exit 0
fi

for _ in $(seq 1 18); do
  if curl -fsS "https://$DOMAIN/api/health" | grep -q '"ok":true'; then
    echo "Live: https://$DOMAIN"
    exit 0
  fi
  sleep 10
done
echo "::notice ::$DOMAIN is attached; its certificate can take a few minutes. Check https://$DOMAIN/api/health again shortly."
