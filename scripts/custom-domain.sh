#!/usr/bin/env bash
# Connects jaxsquares.com to the Worker, run by the Deploy workflow after each
# deploy (never failing it). It prints the domain's public DNS, then:
#   - no Cloudflare zone for the domain yet: creates it in the token's account
#     (Free plan, no records copied: the domain has no email records, and its
#     Squarespace website records would clash with the Worker);
#   - zone pending: asks Cloudflare to re-check and prints the two nameservers
#     to set at the registrar (Squarespace);
#   - zone active: attaches the domain to the Worker as a Custom Domain,
#     redirects www to it, and checks https://$DOMAIN/api/health.
# Every step is idempotent. A permission the token lacks is reported, not
# fatal; docs/domain.md has the dashboard steps for each.
set -uo pipefail

DOMAIN="${DOMAIN:-jaxsquares.com}"
SERVICE="${SERVICE:-jaxsquares}"
CF=https://api.cloudflare.com/client/v4

api() { curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" "$@"; }
ok() { [ "$(echo "$1" | jq -r '.success')" = "true" ]; }
errors() { echo "$1" | jq -c '.errors'; }

echo "== Public DNS for $DOMAIN"
for type in NS A AAAA MX TXT DS; do
  echo "-- $type: $(dig +short "$DOMAIN" "$type" | tr '\n' ' ')"
done
echo "-- www: $(dig +short "www.$DOMAIN" CNAME | tr '\n' ' ') $(dig +short "www.$DOMAIN" A | tr '\n' ' ')"

echo "== Cloudflare zone"
account=$(api "$CF/accounts" | jq -r '.result[0].id // empty')
zones=$(api "$CF/zones?name=$DOMAIN")
if ! ok "$zones"; then
  echo "::warning ::The API token can't read zones: $(errors "$zones"). See docs/domain.md."
  exit 0
fi
zone_id=$(echo "$zones" | jq -r '.result[0].id // empty')
if [ -z "$zone_id" ]; then
  echo "No zone for $DOMAIN yet: creating it (Free plan)."
  created=$(api -X POST "$CF/zones" -d "{\"name\":\"$DOMAIN\",\"account\":{\"id\":\"$account\"},\"type\":\"full\",\"jump_start\":false}")
  if ! ok "$created"; then
    echo "::warning ::Couldn't create the $DOMAIN zone with this token: $(errors "$created"). Add it in the dashboard (Add a domain, Free plan). See docs/domain.md."
    exit 0
  fi
  zones=$(api "$CF/zones?name=$DOMAIN")
  zone_id=$(echo "$zones" | jq -r '.result[0].id // empty')
fi
status=$(echo "$zones" | jq -r '.result[0].status // empty')
nameservers=$(echo "$zones" | jq -r '.result[0].name_servers | join(" and ")')
echo "Zone $DOMAIN: $status"
echo "Cloudflare nameservers: $nameservers"
if [ "$status" != "active" ]; then
  api -X PUT "$CF/zones/$zone_id/activation_check" | jq -c '{activation_check: .success, errors}'
  echo "::notice ::$DOMAIN is $status on Cloudflare. At Squarespace (Domains > $DOMAIN > DNS > Domain nameservers > Use custom nameservers) set: $nameservers"
  exit 0
fi

echo "== Attaching $DOMAIN to the $SERVICE Worker"
attached=$(api -X PUT "$CF/accounts/$account/workers/domains" \
  -d "{\"environment\":\"production\",\"hostname\":\"$DOMAIN\",\"service\":\"$SERVICE\",\"zone_id\":\"$zone_id\"}")
echo "$attached" | jq -c '{success, errors, hostname: .result.hostname, service: .result.service}'
if ! ok "$attached"; then
  echo "::warning ::Couldn't attach $DOMAIN with this token. Attach it in the dashboard: Workers & Pages > $SERVICE > Settings > Domains & Routes > Add > Custom domain."
fi

echo "== www.$DOMAIN -> $DOMAIN"
# A proxied placeholder record so www reaches Cloudflare, then a 301 rule.
www=$(api "$CF/zones/$zone_id/dns_records?name=www.$DOMAIN")
if ok "$www" && [ "$(echo "$www" | jq '.result | length')" = "0" ]; then
  api -X POST "$CF/zones/$zone_id/dns_records" \
    -d "{\"type\":\"AAAA\",\"name\":\"www\",\"content\":\"100::\",\"proxied\":true,\"comment\":\"Redirected to $DOMAIN by a redirect rule\"}" \
    | jq -c '{www_record: .success, errors}'
fi
rule="{\"description\":\"www to $DOMAIN\",\"expression\":\"(http.host eq \\\"www.$DOMAIN\\\")\",\"action\":\"redirect\",\"action_parameters\":{\"from_value\":{\"status_code\":301,\"preserve_query_string\":true,\"target_url\":{\"expression\":\"concat(\\\"https://$DOMAIN\\\", http.request.uri.path)\"}}}}"
phase="$CF/zones/$zone_id/rulesets/phases/http_request_dynamic_redirect/entrypoint"
current=$(api "$phase")
if ok "$current" && echo "$current" | jq -e --arg d "www to $DOMAIN" '.result.rules // [] | any(.description == $d)' >/dev/null; then
  echo "www redirect: already there"
else
  rules=$( (echo "$current" | jq -c '.result.rules // []' 2>/dev/null || echo '[]') | jq -c --argjson r "$rule" '[.[] | {description, expression, action, action_parameters, enabled} | with_entries(select(.value != null))] + [$r]')
  api -X PUT "$phase" -d "{\"rules\":$rules}" | jq -c '{www_redirect: .success, errors}'
fi

for _ in $(seq 1 18); do
  if curl -fsS "https://$DOMAIN/api/health" | grep -q '"ok":true'; then
    echo "Live: https://$DOMAIN"
    exit 0
  fi
  sleep 10
done
echo "::notice ::$DOMAIN is attached; its certificate can take a few minutes. Check https://$DOMAIN/api/health again shortly."
