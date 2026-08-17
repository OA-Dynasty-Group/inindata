# Supabase + Vercel Quick Start

Deploy to production in 5 minutes.

## Step 1: Create Supabase Project (2 minutes)

1. Sign up: https://supabase.com
2. Click "New Project"
3. Name: `ngo-data-platform`
4. Save the database password
5. Region: Closest to your users
6. Click "Create new project" (wait ~2 min)

## Step 2: Get Connection Strings (1 minute)

1. Once created, go to Settings → Database
2. Copy **PgBouncer** connection string (for production use)
   - Format: `postgresql://postgres.xxxxx:PASSWORD@db.xxxxx.supabase.co:6543/postgres`
   - Note the port is `6543` not `5432`

## Step 3: Create Database Schema (1 minute)

1. In Supabase, go to SQL Editor
2. Paste this entire file: [db/001_initial_schema.sql](db/001_initial_schema.sql)
3. Click Run

## Step 4: Deploy to Vercel (1 minute)

1. Push to GitHub: `git push origin main`
2. Go to https://vercel.com
3. "Add New" → Select your GitHub repo
4. Add Environment Variables:
   - `DATABASE_URL_PGBOUNCER`: Paste your PgBouncer string
   - `NODE_ENV`: `production`
   - `FIELDWORK_BOOTSTRAP_PASSWORD`: A strong password
5. Click "Deploy"

## Step 5: Verify Deployment

Test the health endpoint:

```bash
curl https://your-app.vercel.app/api/health/db
```

Response should include database version info.

## That's It! 🎉

Your app is now live with:
- ✅ PostgreSQL database (Supabase)
- ✅ Auto-scaling serverless functions (Vercel)
- ✅ Connection pooling (PgBouncer)
- ✅ SSL/TLS encryption
- ✅ Daily automated backups (Supabase)

## Login

Default credentials (change immediately):
- **Email**: `admin@communityreach.local`
- **Password**: Your `FIELDWORK_BOOTSTRAP_PASSWORD`

## Connection Modes Explained

| Mode | Use Case | Port | URL |
|------|----------|------|-----|
| **Direct** | Local development | 5432 | `...@host:5432/...` |
| **PgBouncer** | Production/Serverless | 6543 | `...@host:6543/...` |

**Why PgBouncer for production?**
- Handles connection multiplexing
- Prevents "too many connections" errors
- Optimized for serverless functions
- Lower latency and better performance

## Troubleshooting

**"too many connections" error**
- Ensure you're using PgBouncer URL (port 6543)

**Database not initializing**
- Go to Supabase SQL Editor
- Paste `db/001_initial_schema.sql` and click Run

**Health check fails**
- Check Vercel logs: Dashboard → Deployments → Logs
- Check Supabase monitoring: Settings → Monitoring

## Next Steps

1. Customize your admin password (Settings → Users)
2. Create additional users and programs
3. Enable email notifications (Phase 2)
4. Set up analytics dashboards (Phase 5)

## Documentation

- Full guide: [SUPABASE_VERCEL_DEPLOYMENT.md](SUPABASE_VERCEL_DEPLOYMENT.md)
- Database schema: [db/001_initial_schema.sql](db/001_initial_schema.sql)
- Development guide: [DEVELOPMENT.md](DEVELOPMENT.md)

---

Questions? Check the logs or enable DEBUG mode:
```bash
vercel env add DEBUG true
```
