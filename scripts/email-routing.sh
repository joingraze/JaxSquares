#!/usr/bin/env bash
# Forwards every address @jaxsquares.com (support@ included) to the owner's
# inbox with Cloudflare Email Routing, run by .github/workflows/email-routing.yml:
#   - turns Email Routing on for the zone (Cloudflare adds its MX and SPF
#     records) when it's off;
#   - adds FORWARD_TO as a destination address (Cloudflare emails it a
#     verification link; nothing forwards until it's clicked);
#   - points the catch-all rule at FORWARD_TO.
# FORWARD_TO comes from a repository secret, so it's never in this public repo
# or printed in a log. Every step is idempotent. A permission the token lacks
# fails the run with the permission to add (docs/domain.md "Email").
set -uo pipefail

DOMAIN="${DOMAIN:-jaxsquares.com}"
CF=https://api.cloudflare.com/client/v4

api() { curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" "$@"; }
ok() { [ "$(echo "$1" | jq -r '.success')" = "true" ]; }
errors() { echo "$1" | jq -c '[.errors[]? | .message]'; }
missing=()
need() { missing+=("$1"); echo "::error ::$2: $3. The token needs the permission $1."; }

zones=$(api "$CF/zones?name=$DOMAIN")
zone_id=$(echo "$zones" | jq -r '.result[0].id // empty')
account=$(echo "$zones" | jq -r '.result[0].account.id // empty')
if [ -z "$zone_id" ] || [ -z "$account" ]; then
  echo "::error ::Couldn't read the $DOMAIN zone: $(errors "$zones")"
  exit 1
fi

echo "== Email Routing on $DOMAIN"
settings=$(api "$CF/zones/$zone_id/email/routing")
if ! ok "$settings"; then
  need "Zone · Email Routing Rules · Edit" "Couldn't read Email Routing" "$(errors "$settings")"
elif [ "$(echo "$settings" | jq -r '.result.enabled')" = "true" ]; then
  echo "On (status: $(echo "$settings" | jq -r '.result.status'))"
else
  enabled=$(api -X POST "$CF/zones/$zone_id/email/routing/dns" -d '{}')
  if ! ok "$enabled"; then enabled=$(api -X POST "$CF/zones/$zone_id/email/routing/enable" -d '{}'); fi
  if ok "$enabled"; then
    echo "Turned on; Cloudflare added its MX and SPF records"
  else
    need "Zone · Zone Settings · Edit and Zone · DNS · Edit" "Couldn't turn Email Routing on" "$(errors "$enabled")"
  fi
fi

echo "== Destination address"
addresses=$(api "$CF/accounts/$account/email/routing/addresses?per_page=50")
if ! ok "$addresses"; then
  need "Account · Email Routing Addresses · Edit" "Couldn't read destination addresses" "$(errors "$addresses")"
else
  dest=$(echo "$addresses" | jq -c --arg e "$FORWARD_TO" '[.result[] | select((.email | ascii_downcase) == ($e | ascii_downcase))][0] // empty')
  if [ -z "$dest" ]; then
    dest=$(api -X POST "$CF/accounts/$account/email/routing/addresses" -d "$(jq -cn --arg e "$FORWARD_TO" '{email: $e}')")
    if ok "$dest"; then
      dest=$(echo "$dest" | jq -c '.result')
      echo "Added; Cloudflare sent it a verification email"
    else
      need "Account · Email Routing Addresses · Edit" "Couldn't add the destination address" "$(errors "$dest")"
      dest=""
    fi
  else
    echo "Already added"
  fi
  if [ -n "$dest" ]; then
    if [ "$(echo "$dest" | jq -r '.verified // empty')" = "" ]; then
      echo "::warning ::Not verified yet: open Cloudflare's \"Verify your email address\" email in that inbox and click the link. Nothing forwards until then."
    else
      echo "Verified"
    fi
  fi
fi

echo "== Catch-all rule"
rule=$(jq -cn --arg e "$FORWARD_TO" '{name: "Everything to the owner", enabled: true, matchers: [{type: "all"}], actions: [{type: "forward", value: [$e]}]}')
catchall=$(api -X PUT "$CF/zones/$zone_id/email/routing/rules/catch_all" -d "$rule")
if ok "$catchall"; then
  echo "On: every address @$DOMAIN forwards to the destination"
else
  need "Zone · Email Routing Rules · Edit" "Couldn't set the catch-all rule" "$(errors "$catchall")"
fi

dns=$(api "$CF/zones/$zone_id/email/routing/dns")
if ok "$dns"; then
  # The records Email Routing needs: a list, or {record, errors} in newer API versions.
  echo "== Email Routing DNS: $(echo "$dns" | jq -r '[(.result | if type == "array" then .[] else (.record // [])[] end) | "\(.type) \(.content)"] | unique | join(", ")' 2>/dev/null)"
  problems=$(echo "$dns" | jq -c '.result | if type == "object" then (.errors // empty) else empty end' 2>/dev/null)
  [ -n "$problems" ] && [ "$problems" != "[]" ] && echo "::warning ::DNS problems Cloudflare reports: $problems"
fi

if [ ${#missing[@]} -gt 0 ]; then
  echo
  echo "Add to the token (Cloudflare > My Profile > API Tokens > the GitHub deploy token > Edit), then re-run:"
  printf '  - %s\n' "${missing[@]}" | sort -u
  exit 1
fi
