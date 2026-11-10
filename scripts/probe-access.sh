#!/usr/bin/env bash
# After a deploy: ask a deployment whether it believes the unsigned email header. Usage: probe-access.sh <label> <base-url>
#
# The request names an address that is on no allow-list and carries no signed token. A deployment that checks the token
# answers 401. A 503 means its Access settings are missing, and anything else means the token is not being checked. The
# response body is thrown away, so a failing probe prints nothing of what the deployment sent.
set -u
label="${1:?usage: probe-access.sh <label> <base-url>}"
base="${2:?usage: probe-access.sh <label> <base-url>}"

status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
  -H 'Cf-Access-Authenticated-User-Email: deploy-probe@example.com' \
  "${base%/}/api/access/status") || status=000

case "$status" in
  401) echo "$label: the Access token is checked (the probe got a 401)." ;;
  503) echo "::error::$label answered 503: ACCESS_TEAM_DOMAIN or ACCESS_AUD is missing from this deployment." ; exit 1 ;;
  000) echo "::error::$label did not answer the Access probe." ; exit 1 ;;
  *) echo "::error::$label answered $status to the Access probe, expected 401: the signed token is not being checked." ; exit 1 ;;
esac
