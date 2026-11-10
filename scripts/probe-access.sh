#!/usr/bin/env bash
# After a deploy: ask a deployment whether it believes the unsigned email header. Usage: probe-access.sh <label> <base-url>
#
# The request names an address that is on no allow-list and carries no signed token. A deployment that checks the token
# answers 401. A 503 means its Access settings are missing, and anything else means the token is not being checked. The
# probe sends no token, so it cannot tell a right ACCESS_AUD or team domain from a wrong one: only a real sign-in does.
# A blip is retried (below) so a good deploy is not failed by it; the answer that counts is the last one. The response
# body is thrown away, so a failing probe prints nothing of what the deployment sent.
set -u
label="${1:?usage: probe-access.sh <label> <base-url>}"
base="${2:?usage: probe-access.sh <label> <base-url>}"

# Three more tries after a timeout, a refused connection, a 408 or 429, or a 5xx. Any other answer, a 401 included,
# ends it.
attempt=0
while :; do
  status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
    -H 'Cf-Access-Authenticated-User-Email: deploy-probe@example.com' \
    "${base%/}/api/access/status") || status=000
  case "$status" in
    000 | 408 | 429 | 5??) [ "$attempt" -lt 3 ] || break ;;
    *) break ;;
  esac
  attempt=$((attempt + 1))
  sleep "${PROBE_RETRY_DELAY:-3}"
done

case "$status" in
  401) echo "$label: an unsigned identity was refused (401)." ;;
  503) echo "::error::$label answered 503: ACCESS_TEAM_DOMAIN or ACCESS_AUD is missing from this deployment." ; exit 1 ;;
  000) echo "::error::$label did not answer the Access probe." ; exit 1 ;;
  *) echo "::error::$label answered $status to the Access probe, expected 401. A 200 or 403 means the signed token is not being checked." ; exit 1 ;;
esac
