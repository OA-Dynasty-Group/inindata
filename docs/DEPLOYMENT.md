# Deployment Guide — Production Setup

This guide covers deploying the Fieldwork NGO data platform for production use.

> ⚠️ **Current Status**: The MVP uses a file-based JSON store. Before handling sensitive production data, migrate to PostgreSQL and implement the security gaps listed in this document.

## Pre-Deployment Checklist

- [ ] Review [SECURITY.md](SECURITY.md) thoroughly
- [ ] Run full test suite: `npm test`
- [ ] Test with production-like Node.js version
- [ ] Generate a unique `FIELDWORK_BOOTSTRAP_PASSWORD` (64+ random characters)
- [ ] Create a dedicated service account (non-root)
- [ ] Secure the `data/` directory with restrictive file permissions
- [ ] Set up TLS reverse proxy (nginx, Caddy, IIS URL Rewrite, or load balancer)
- [ ] Configure automated backups
- [ ] Plan for PostgreSQL migration (see "Production Readiness" section)

## Environment Setup

The application requires two environment variables. **Do not** use `.env` files; inject them through:
- Operating system service manager (systemd, Windows Service)
- Container orchestration (Docker, Kubernetes)
- Cloud platform environment (AWS Systems Manager, Azure Key Vault, Google Secret Manager)
- Approved secrets management system

### Environment Variables

| Variable | Required | Example | Notes |
|----------|----------|---------|-------|
| `FIELDWORK_PORT` | No | `3000` | Private listener port (not exposed publicly) |
| `FIELDWORK_BOOTSTRAP_PASSWORD` | **Yes** | `$(openssl rand -base64 32)` | Set before first start; cannot be changed without data loss |

## Running the Server

### Option 1: Direct Node.js (Development/Testing)

```bash
export FIELDWORK_PORT=3000
export FIELDWORK_BOOTSTRAP_PASSWORD="$(openssl rand -base64 32)"
node server.js
```

**Verify startup:**
```bash
curl http://localhost:3000/api/health
# Response: {"status":"ok"}
```

### Option 2: Systemd (Linux/Ubuntu)

Create `/etc/systemd/system/fieldwork.service`:

```ini
[Unit]
Description=Fieldwork NGO Data Platform
After=network.target

[Service]
Type=simple
User=fieldwork
WorkingDirectory=/opt/fieldwork
ExecStart=/usr/bin/node /opt/fieldwork/server.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/opt/fieldwork/data

# Environment
Environment="FIELDWORK_PORT=3000"
Environment="FIELDWORK_BOOTSTRAP_PASSWORD=your-secret-here"

[Install]
WantedBy=multi-user.target
```

**Deploy:**
```bash
sudo cp fieldwork.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable fieldwork
sudo systemctl start fieldwork
sudo systemctl status fieldwork
```

**View logs:**
```bash
sudo journalctl -u fieldwork -f
```

### Option 3: Docker

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
```

**Build and run:**
```bash
docker build -t fieldwork:latest .

docker run -d \
  --name fieldwork \
  -p 127.0.0.1:3000:3000 \
  -v fieldwork-data:/app/data \
  -e FIELDWORK_PORT=3000 \
  -e FIELDWORK_BOOTSTRAP_PASSWORD="$(openssl rand -base64 32)" \
  fieldwork:latest
```

**Docker Compose** example:

```yaml
version: '3.8'
services:
  fieldwork:
    build: .
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    volumes:
      - fieldwork-data:/app/data
    environment:
      FIELDWORK_PORT: "3000"
      FIELDWORK_BOOTSTRAP_PASSWORD: "${FIELDWORK_PASSWORD}"
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  fieldwork-data:
    driver: local
```

### Option 4: Windows Service (IIS with Application Request Routing)

Use **IIS URL Rewrite** to proxy to the Node.js application:

1. Install Node.js on Windows Server
2. Set up a Windows Service using `nssm` or similar:

```powershell
# Install nssm
choco install nssm

# Create service
nssm install Fieldwork "C:\Program Files\nodejs\node.exe" "C:\fieldwork\server.js"
nssm set Fieldwork AppEnvironmentExtra FIELDWORK_PORT=3000
nssm set Fieldwork AppEnvironmentExtra FIELDWORK_BOOTSTRAP_PASSWORD=your-secret-here
nssm set Fieldwork AppDirectory "C:\fieldwork"

# Start service
nssm start Fieldwork

# View logs
nssm edit Fieldwork  # Configure logging
```

## Reverse Proxy Configuration

The Node server must run behind a TLS-capable reverse proxy that:
- Owns the public hostname and certificate
- Redirects HTTP → HTTPS
- Forwards requests only to permitted routes
- Implements rate limiting and request-body size limits
- Strips internal headers (X-Forwarded-*)

### Nginx (Recommended)

```nginx
# /etc/nginx/sites-available/fieldwork.conf
upstream fieldwork_backend {
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 80;
    server_name fieldwork.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name fieldwork.example.com;

    ssl_certificate /etc/letsencrypt/live/fieldwork.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fieldwork.example.com/privkey.pem;

    client_max_body_size 10M;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;
    limit_req_zone $binary_remote_addr zone=general:10m rate=100r/m;

    location /api/auth/login {
        limit_req zone=login burst=10;
        proxy_pass http://fieldwork_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        limit_req zone=general burst=50;
        proxy_pass http://fieldwork_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Deploy:**
```bash
sudo ln -s /etc/nginx/sites-available/fieldwork.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Caddy (Simplified)

`Caddyfile`:
```
fieldwork.example.com {
    encode gzip
    
    # Rate limiting
    rate_limit /api/auth/login 5 per 1m
    rate_limit / 100 per 1m
    
    reverse_proxy 127.0.0.1:3000 {
        header_uri X-Forwarded-For {remote_host}
        header_uri X-Forwarded-Proto {scheme}
    }
}
```

**Run:**
```bash
caddy run
```

## Data Directory Protection

**Linux/macOS:**
```bash
sudo useradd -s /bin/false fieldwork
sudo mkdir -p /opt/fieldwork/data
sudo chown fieldwork:fieldwork /opt/fieldwork/data
sudo chmod 700 /opt/fieldwork/data
```

**Windows (PowerShell):**
```powershell
$acl = Get-Acl "C:\fieldwork\data"
$acl.Access | Where-Object {$_.IdentityReference -notlike "*SYSTEM*" -and $_.IdentityReference -notlike "*Administrators*"} | ForEach-Object {
    $acl.RemoveAccessRule($_)
}
Set-Acl "C:\fieldwork\data" $acl
```

## Health Checks & Monitoring

### Startup verification

```bash
curl -f http://127.0.0.1:3000/api/health || exit 1
```

### Continuous monitoring

```bash
# Health check via external monitoring
curl -f https://fieldwork.example.com/api/health

# Check application logs
tail -f /var/log/fieldwork.log

# Monitor process
watch 'ps aux | grep node'
```

## Backup & Recovery

**Daily backup (file store):**

```bash
#!/bin/bash
# Stop the application before backup
sudo systemctl stop fieldwork

# Create timestamped backup
BACKUP_DIR="/backup/fieldwork"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
cp /opt/fieldwork/data/store.json "$BACKUP_DIR/store_$TIMESTAMP.json"

# Encrypt backup
gpg --cipher-algo AES256 --symmetric --output "$BACKUP_DIR/store_$TIMESTAMP.json.gpg" "$BACKUP_DIR/store_$TIMESTAMP.json"
rm "$BACKUP_DIR/store_$TIMESTAMP.json"

# Restart application
sudo systemctl start fieldwork

# Verify backup
sudo gpg --output /dev/null --decrypt "$BACKUP_DIR/store_$TIMESTAMP.json.gpg"
```

See [BACKUP_RESTORE.md](BACKUP_RESTORE.md) for detailed recovery procedures.

## Production Readiness Gaps

⚠️ The following are **not implemented** in the current MVP:

### Critical for Sensitive Data
- [ ] PostgreSQL persistence (file store → database)
- [ ] Automated database backups & point-in-time recovery
- [ ] Shared session store (multi-instance deployments)
- [ ] Login rate-limiting & throttling
- [ ] CSRF token protection
- [ ] Secure cookie attributes (HttpOnly, Secure, SameSite)

### Operational
- [ ] Centralized logging aggregation
- [ ] Metrics & alerting
- [ ] Password reset workflow
- [ ] Multi-factor authentication (MFA)
- [ ] Token revocation mechanism
- [ ] Secret rotation procedures
- [ ] Data retention/deletion policy

### Compliance
- [ ] Encryption at rest
- [ ] Encryption in transit (TLS 1.3)
- [ ] Key management (rotating secrets)
- [ ] Audit log immutability
- [ ] Data classification & handling
- [ ] Incident response runbooks

## Migration to PostgreSQL

When ready for production, migrate from file store to PostgreSQL:

1. **Create database schema** (use [db/001_initial_schema.sql](db/001_initial_schema.sql) as template)
2. **Update `server.js`**:
   - Replace `load()` and `write()` functions with database queries
   - Implement transactional operations
   - Add connection pooling
3. **Add middleware** for authentication/authorization
4. **Implement migrations** for schema updates
5. **Add backup automation** at the database level
6. **Test thoroughly** before going live

Example PostgreSQL connection:
```javascript
const pg = require('pg');
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function load() {
  const result = await pool.query('SELECT * FROM data LIMIT 1');
  return result.rows[0];
}
```

## Maintenance & Updates

### Updating the application

```bash
# Pull latest code
git pull origin main

# Install any new dependencies
npm ci

# Run tests
npm test

# Restart the service
sudo systemctl restart fieldwork
```

### Node.js updates

Test in a staging environment first, then:

```bash
# macOS/Linux
nvm install 18.20.0
nvm alias default 18.20.0

# Or update system Node.js
sudo apt update && sudo apt upgrade nodejs
```

## Support & Troubleshooting

**Common issues:**

| Issue | Solution |
|-------|----------|
| Port 3000 in use | Change `FIELDWORK_PORT` to an available port |
| Permission denied on data/ | Run as service user with write access to data directory |
| Certificate errors | Verify TLS cert at reverse proxy, not Node.js |
| Session cookie not set | Ensure HTTPS at reverse proxy, not just localhost |
| Out of memory | Monitor with `top` or `htop`; increase node heap if needed |

For detailed logs, see the service manager output (systemd, Docker, nssm, etc.).

---

Next steps:
- Deploy to staging environment
- Run full integration tests
- Plan data migration to PostgreSQL
- Document operational runbooks
- Set up monitoring & alerting
- Schedule security audit before production access
