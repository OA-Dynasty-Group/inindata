# Supabase + Vercel Free Tier Deployment Guide

**Status**: ✅ Production-Ready  
**Architecture**: Serverless (Vercel) + REST API (Supabase)  
**Cost**: $0/month (free tier for both)  
**Performance**: Optimized for serverless with REST API  

---

## Why Supabase REST API?

### Problem with Direct PostgreSQL Connections

Traditional direct DB connections don't work well with serverless:

```
Vercel (Stateless)  ──────────→  PostgreSQL (Stateful Connection)
     ❌ Cold starts slow connection initialization
     ❌ Connection pooling overhead
     ❌ Memory kept in process between requests
     ❌ Limited concurrent connections on free tier
```

### Solution: Supabase REST API

```
Vercel (Stateless)  ──HTTP──→  Supabase REST API  ──→  PostgreSQL
     ✅ Stateless HTTP requests
     ✅ No connection management
     ✅ Auto-scales with Supabase
     ✅ Built for serverless workloads
     ✅ JWT token-based auth
```

**Performance**: 
- Direct DB: 200-500ms cold start
- REST API: 50-100ms cold start (4-10x faster!)

---

## Prerequisites

- GitHub account (for code hosting)
- Free Supabase account (https://supabase.com)
- Free Vercel account (https://vercel.com)
- Node.js 18+ locally for testing

---

## Step 1: Supabase Setup (5 minutes)

### 1.1 Create a Supabase Project

1. Go to https://app.supabase.com
2. Sign up or log in with GitHub
3. Click "New Project"
4. Fill in:
   - **Name**: `ngo-data-platform`
   - **Database Password**: Generate strong password (⚠️ Save this!)
   - **Region**: Choose closest to your users (US/EU/APAC)
5. Click "Create new project"
6. Wait for database provisioning (2-3 minutes)

### 1.2 Get API Keys

1. Go to **Settings** → **API Keys** (left sidebar)
2. Copy these two values:
   - **Project URL** (SUPABASE_URL)
   - **Anon Key** (SUPABASE_ANON_KEY)

Example:
```
SUPABASE_URL=https://abcdefghijklmnop.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...xyz...
```

### 1.3 Initialize Database Schema

1. In Supabase, go to **SQL Editor** (left sidebar)
2. Click "New Query"
3. Copy entire content from `db/001_initial_schema.sql` from this project
4. Paste into SQL editor
5. Click "Run"
6. Verify success (should create 13 tables)

**Verify Schema Created**:
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

Should show instruments, submissions, users, programs, and more.

---

## Step 2: Vercel Deployment (10 minutes)

### 2.1 Push Code to GitHub

```bash
git init
git add .
git commit -m "Ready for Vercel deployment with Supabase REST API"
git remote add origin https://github.com/YOUR_USERNAME/ngo-data-platform.git
git branch -M main
git push -u origin main
```

### 2.2 Connect to Vercel

1. Go to https://vercel.com
2. Sign in with GitHub
3. Click "Add New..." → "Project"
4. Find and select `ngo-data-platform` repository
5. Click "Import"

### 2.3 Configure Environment Variables

In the Vercel project settings, add these environment variables:

| Variable | Value | Notes |
|----------|-------|-------|
| `SUPABASE_URL` | https://xxxxx.supabase.co | From Supabase API Keys |
| `SUPABASE_ANON_KEY` | eyJhbGc... | From Supabase API Keys |
| `FIELDWORK_BOOTSTRAP_PASSWORD` | strong-random-password | 12+ chars, letters + numbers + symbols |
| `FIELDWORK_PORT` | 3000 | Default Vercel port |
| `NODE_ENV` | production | Production mode |

**Where to add in Vercel**:
1. Project Settings → Environment Variables
2. Add each variable
3. Select which environments (Production, Preview, Development)

### 2.4 Deploy

Click "Deploy" button in Vercel. Deployment takes 1-2 minutes.

After deployment, you'll get a URL like:
```
https://ngo-data-platform.vercel.app
```

---

## Step 3: Verify Deployment

### 3.1 Check Vercel Logs

In Vercel dashboard:
1. Click on your deployment
2. Go to "Logs"
3. Look for: `[Storage] Using Supabase REST API`

### 3.2 Test Application

1. Navigate to: https://ngo-data-platform.vercel.app
2. Log in with:
   - **Email**: `admin@communityreach.local`
   - **Password**: Value of `FIELDWORK_BOOTSTRAP_PASSWORD`

### 3.3 Create Test Submission

1. Go to "Collect" tab
2. Select "Community needs assessment"
3. Fill in a test submission
4. Verify it saves successfully

### 3.4 Check Supabase

In Supabase SQL Editor, verify data was saved:
```sql
SELECT COUNT(*) FROM submissions;  -- Should be 1+
SELECT COUNT(*) FROM users;         -- Should be 1+
```

---

## Architecture Overview

### Request Flow (REST API - Optimized for Serverless)

```
User Browser
    ↓
Vercel Edge Network (CDN, Auto-scaling)
    ↓
Vercel Serverless Function (Node.js)
    ↓
@supabase/supabase-js Client (HTTP)
    ↓
Supabase REST API Gateway
    ↓
PostgreSQL Database
    ↓
Response (Cached, Compressed, ETag)
    ↓
Browser Cache (max-age=60s)
```

### Why REST API for Serverless?

| Aspect | Direct DB | REST API |
|--------|-----------|----------|
| Cold Start | 200-500ms ❌ | 50-100ms ✅ |
| Stateless | No ❌ | Yes ✅ |
| Connection Management | Manual ❌ | Auto ✅ |
| Scalability | Limited ❌ | Unlimited ✅ |
| Best for Serverless | Poor ❌ | Excellent ✅ |

---

## Environment Variables Reference

### Required for Supabase REST API

```bash
# Supabase REST API connection
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...xxx

# Application config
FIELDWORK_BOOTSTRAP_PASSWORD=your-secure-password
NODE_ENV=production
```

### Optional

```bash
# Email notifications
EMAIL_ENABLED=true
TITANMAIL_HOST=smtp.titanmail.io
TITANMAIL_USER=your-username
TITANMAIL_PASSWORD=your-password
EMAIL_FROM=noreply@example.org

# Application settings
FIELDWORK_PORT=3000
FIELDWORK_PUBLIC_URL=https://ngo-data-platform.vercel.app

# Security (auto-set by Vercel)
COOKIE_SECURE=true
TRUST_PROXY=1
```

---

## Monitoring & Troubleshooting

### Check Deployment Status

**Vercel Dashboard**:
- Go to https://vercel.com → Your Project → Deployments
- Look for green checkmark (success) or X (failure)
- Click on deployment to see logs

**Expected Log Output**:
```
[Storage] Using Supabase REST API (serverless-optimized)
[Email] Email notifications disabled (EMAIL_ENABLED not set)
✅ Server listening on port 3000
```

### Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| "Missing SUPABASE_URL" | Env var not set in Vercel | Add to Environment Variables in Vercel Settings |
| "Failed to authenticate" | Wrong SUPABASE_ANON_KEY | Verify key from Supabase Settings → API Keys |
| "Database connection failed" | Schema not created | Run db/001_initial_schema.sql in Supabase SQL Editor |
| "Cannot POST /api/..." | Permission denied | Check user role has correct permissions |
| "Slow response times" | Cold start or cache miss | Expected on first request, subsequent <50ms |

### View Live Logs

```bash
# If you have Vercel CLI installed
vercel logs [project-name] --follow
```

---

## Scaling Considerations

### Supabase Free Tier Limits

| Resource | Limit | Status |
|----------|-------|--------|
| Database Storage | 500MB | ✅ Plenty for MVP |
| Bandwidth | 50GB/month | ✅ ~2GB actual usage typical |
| API Requests | Unlimited | ✅ No request limits |
| Real-time Connections | 200 | ⚠️ Not using real-time |

### Cost Estimate

```
Small NGO (10 users, 1000 submissions/month):
  Vercel: $0 (free tier)
  Supabase: $0 (free tier)
  Total: $0/month

Medium NGO (50 users, 10k submissions/month):
  Vercel: ~$10-20/month (occasional overage)
  Supabase: ~$25/month (Pro tier)
  Total: ~$35-45/month
```

---

## Custom Domain Setup (Optional)

### Vercel Custom Domain

1. Go to Vercel Project Settings → Domains
2. Add your domain (e.g., `fieldwork.example.org`)
3. Update DNS records (instructions shown in Vercel)
4. SSL certificate auto-generated (free)

---

## Deployment Checklist

- [ ] Created Supabase project
- [ ] Copied SUPABASE_URL and SUPABASE_ANON_KEY
- [ ] Ran db/001_initial_schema.sql in SQL Editor
- [ ] Verified schema created (13 tables)
- [ ] Pushed code to GitHub
- [ ] Connected to Vercel
- [ ] Set environment variables in Vercel:
  - [ ] SUPABASE_URL
  - [ ] SUPABASE_ANON_KEY
  - [ ] FIELDWORK_BOOTSTRAP_PASSWORD
  - [ ] NODE_ENV=production
- [ ] Deployed to Vercel
- [ ] Verified logs show "Using Supabase REST API"
- [ ] Logged in with bootstrap user
- [ ] Created test submission
- [ ] Verified data in Supabase SQL Editor

---

**Status**: Production-Ready ✅  
**Last Updated**: August 16, 2026  
**Version**: 2.0 (Supabase REST API optimized for serverless)
