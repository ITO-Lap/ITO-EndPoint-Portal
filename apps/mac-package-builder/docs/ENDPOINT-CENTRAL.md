# Endpoint Central Integration

This is the deployment contract for the later signed agent deliverable. Replace every `YOUR_*` value with organization-owned signing, API, and Endpoint Central configuration. The sample intentionally does not download unsigned installers or run application install commands.

## Deployment sequence

1. Build the user agent and privileged helper as separately signed products. Sign with the organization's Developer ID certificates, notarize the distribution, staple tickets, and verify signatures before packaging.
2. Package the notarized agent in a versioned PKG. Deploy it with Endpoint Central's macOS software deployment workflow and scope assignments to a pilot device group first.
3. Install/update the LaunchDaemon through the signed PKG postinstall lifecycle. The daemon must validate its own signed code, use a fixed XPC service identity, and expose only typed scan/approved-install operations.
4. Deploy a PPPC profile only for explicitly required protected resources. Use the actual signed bundle identifiers and designated requirements; do not grant broad Full Disk Access as a convenience.
5. Add an Endpoint Central Self Service catalog entry for the signed App Guardian user app, with user-facing version and support details.
6. Configure a daily scan trigger and a user-requested scan action. Submit inventory to the App Guardian API and, where required, an Endpoint Central custom inventory field/report.

## Release placeholders

```text
PKG:              AppGuardian-<version>-universal.pkg
Team ID:          YOUR_DEVELOPER_TEAM_ID
LaunchDaemon:     /Library/LaunchDaemons/com.example.appguardian.helper.plist
User app:         /Applications/App Guardian.app
API origin:       https://YOUR_API_HOST/api/v1
PPPC profile:     YOUR_MDM_APPROVED_LEAST_PRIVILEGE_PROFILE.mobileconfig
```

## Verification gates

- `pkgutil --check-signature` reports the expected Developer ID installer certificate.
- `spctl --assess --type install --verbose` accepts the notarized installer.
- The deployed helper's Team ID and designated requirement match the XPC client policy.
- A pilot scan reports device and app inventory without expanding beyond approved scan roots.
- A test update is denied when the app is unapproved, its source is changed, a signature/Team ID/notarization/hash check fails, or the target version is not newer.
- Endpoint Central reports the installed agent version and scan result; App Guardian records corresponding immutable audit events.