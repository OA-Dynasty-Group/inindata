# Security notes

## Current security posture

Fieldwork is an MVP. It has role/permission checks, PBKDF2 password hashes,
HTTP-only same-site session cookies, server-side validation, and audit events.
Those controls do not make the current file-backed deployment production ready.

Do not expose the application directly to the public internet in its present
form. Review the limitations below and complete the required engineering work
before handling sensitive or identifiable data.

## Bootstrap administrator

On the first launch with no `data/store.json`, Fieldwork creates a local
administrator. Set `FIELDWORK_BOOTSTRAP_PASSWORD` to a unique, long random
password *before* that first launch. If it is absent, the documented local
development password is used. Never use that default in a shared environment.

The setting only affects initial store creation. Once `data/store.json` exists,
changing the environment variable does not change an existing password. Use a
controlled account-recovery process (not currently implemented) or an approved
data migration to rotate it.

Keep bootstrap values out of source control, shell history, tickets, and logs.
Use your host's secret manager or protected runtime environment instead of
committing a `.env` file. `.env.example` is a template only.

## TLS, cookies, and reverse proxies

Terminate TLS at an organization-managed reverse proxy or load balancer, force
HTTP to HTTPS redirects there, and expose only the proxy publicly. Limit direct
access to the Node process to the proxy/private network.

The application currently sets `HttpOnly` and `SameSite=Lax` session cookies,
but it does **not** set the `Secure` cookie attribute and has no trusted-proxy
configuration. Therefore it must be changed and tested before production
deployment over HTTPS: set `Secure` for production sessions, ensure logout
uses matching cookie attributes, and validate the proxy's forwarded headers
only from known proxy addresses. The commented proxy/cookie variables in
`.env.example` are intentionally not implemented configuration switches.

Use security headers at the proxy (at minimum HSTS after HTTPS is verified,
`X-Content-Type-Options: nosniff`, a restrictive `Content-Security-Policy`,
and frame protection appropriate to your embedding policy). Test public
collection links against the final policy.

## Rate limits and abuse protection

No request rate limiting, login throttling, CAPTCHA, account lockout, or
distributed session store is implemented in this repository. Apply per-IP and
per-route limits at the edge/reverse proxy, with stricter controls for:

- `POST /api/auth/login`
- public `POST /api/collect/:token/submissions`
- CSV preview/import endpoints

Make sure the proxy overwrites, rather than blindly trusts, client IP headers;
otherwise IP-based limits can be bypassed. Capture proxy access logs and alert
on repeated login failures and unexpected submission spikes. These controls
need infrastructure-specific configuration and testing; this document does not
claim that any provider is configured.

## Credentials, sessions, and access

Sessions are held in an in-memory `Map`. A process restart signs everyone out,
and multiple Node instances do not share sessions. Replace this with a durable,
revocable session store before horizontal scaling. Add session expiry/rotation,
CSRF protections for cookie-authenticated state changes, password-reset flows,
MFA where required, and a documented break-glass administrator process.

Use least-privilege roles, promptly suspend departed staff, periodically review
users and audit logs, and treat public collection tokens as secrets: anyone
with a valid token can submit to that published form. Token rotation/revocation
is not currently exposed as an administrative workflow.

## File-store limitations

`data/store.json` is a development-only store. Writes are synchronous,
non-transactional, and not safe for concurrent application processes or
reliable multi-writer operation. It offers no database access control,
encryption at rest, row-level tenancy, locking, migrations, point-in-time
recovery, retention policy, or tamper-evident audit trail. A malformed or
partially written file can make the service unavailable or lose data.

Before production, replace `load`/`write` with a managed or organization-run
PostgreSQL repository (or another approved transactional database), apply
migrations, use a least-privilege database account, encrypt storage/backups,
and test restore procedures. This repository does not yet include that adapter.

## Incident readiness

Define owners and a response path for suspected credential exposure, lost
devices, leaked collection links, unauthorized exports, and corrupted data.
Keep application and proxy logs protected with appropriate retention, avoid
logging passwords/tokens/form answers, and periodically test recovery from a
backup in an isolated environment.
