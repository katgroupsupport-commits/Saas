# Bachat Gat SaaS Platform

Modern React + Supabase-ready SaaS foundation for Indian Bachat Gat / saving group management.

## What is included

- Mobile-first React/Vite app shell
- Role-aware navigation for Super Admin, Group Admin, Collector, Approver, and Member
- Group dashboard, members, subscriptions, period control, transactions, loans, approvals, reports, and settings screens
- Centralized finance services for payment allocation, loan interest, loan eligibility, member share calculations, and period control
- Supabase client bootstrap using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- PostgreSQL schema with tenant-aware group isolation, subscriptions, accounting periods, loans, repayments, approvals, notifications, configurable fields, audit logs, and starter RLS policies

## Run locally

```bash
npm install
npm run dev
```

PowerShell may block `npm.ps1`; use `npm.cmd install` and `npm.cmd run dev` on Windows if needed.

## Environment

Create `.env.local` when Supabase is ready:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Database

The v3 `xxfp_*` schema is applied from `database/` in this order in the Supabase SQL Editor:

1. `database/2026-08-16-v3-xxfp-schema.sql` — creates the `xxfp_*` tables.
2. `database/2026-08-16-v3-xxfp-migrate-data.sql` — copies v2 data into the `xxfp_*` tables (guarded, skipped on a fresh DB) and drops the old tables.
3. `database/2026-06-06-v4-production-safe-rls.sql` — RLS helper functions used by the policies.
4. `database/2026-08-16-v3-xxfp-functions-and-triggers.sql` — RPCs, triggers, RLS policies on the `xxfp_*` tables, and grants.

The application reads and writes the `xxfp_*` tables directly; the legacy table names are not recreated.

## Development phases

1. Authentication, member setup, group setup, subscription model, dashboard, period control
2. Savings, loans, calculation engine, reports
3. Approval workflows, notifications, advanced reports
4. Razorpay subscriptions, WhatsApp, AI insights
