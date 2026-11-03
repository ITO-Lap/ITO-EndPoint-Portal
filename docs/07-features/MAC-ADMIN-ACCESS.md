# Mac administrator access (Policy Compliance)

Mac Devices → Reports → **Policy Compliance** lists Macs whose logged-on user is a local administrator.

Endpoint Central's API exposes the logged-on user's name but not admin-group membership, so a script deployed from
Endpoint Central reports it to this server. A Mac that has not reported is not listed (nothing is inferred), and reports
older than 14 days are excluded and counted as "older than 14 days".

## Setup

1. Set `MAC_ADMIN_REPORT_KEY` in `server/.env` to a random value of 16+ characters and restart the server. Until it is
   set, `POST /api/mac-admin-access/report` returns 404.
2. In Endpoint Central create a Mac custom script (run as root, on a schedule such as daily and at login) with the
   script below. Replace `__SERVER_URL__` with the dashboard's URL as reachable from the Macs (corporate network / VPN)
   and `__REPORT_KEY__` with the key from step 1.

```bash
#!/bin/bash
# Reports whether the console (logged-on) user is a local administrator.
SERVER_URL="__SERVER_URL__"
REPORT_KEY="__REPORT_KEY__"
user=$(/usr/bin/stat -f%Su /dev/console 2>/dev/null)
[ -z "$user" ] || [ "$user" = "root" ] || [ "$user" = "loginwindow" ] && exit 0
if /usr/sbin/dseditgroup -o checkmember -m "$user" admin >/dev/null 2>&1; then status="admin"; else status="standard"; fi
serial=$(/usr/sbin/ioreg -l | /usr/bin/awk -F'"' '/IOPlatformSerialNumber/{print $4; exit}')
host=$(/usr/sbin/scutil --get ComputerName 2>/dev/null)
/usr/bin/curl -fsS --max-time 20 -X POST "$SERVER_URL/api/mac-admin-access/report" \
  -H "Content-Type: application/json" -H "x-report-key: $REPORT_KEY" \
  -d "{\"serial\":\"$serial\",\"user\":\"$user\",\"hostname\":\"$host\",\"status\":\"$status\"}"
```

## Security notes

- The ingest endpoint skips the user-session gate (the Macs have no session). It is protected by the shared key
  (constant-time compare), a rate limit (600/min), a 2 KB body cap and strict field validation. It only ever writes the
  latest report per serial number.
- The key is readable by anyone who can read the script on a Mac. It only permits submitting reports, so rotate it
  (change `.env` and the script) if it leaks. Reports can be spoofed by anyone holding the key.
- Data is stored in `mac-admin-access.json` under `DATA_DIR`. It contains serial numbers, device names and local usernames.
- Read access (`GET /api/mac-admin-access`) requires a normal signed-in session.
