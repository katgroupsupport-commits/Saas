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

Apply `database/schema.sql` in Supabase SQL Editor. The schema is designed around `group_id` tenancy and includes RLS policies for tenant-scoped reads.

## Development phases

1. Authentication, member setup, group setup, subscription model, dashboard, period control
2. Savings, loans, calculation engine, reports
3. Approval workflows, notifications, advanced reports
4. Razorpay subscriptions, WhatsApp, AI insights
