Ask Jordan v3.6.3 — Standalone Admin Dashboard Fix

- /admin and /admin/login now serve a real standalone admin.html page.
- No dialog/modal is used for the admin dashboard.
- Includes sidebar, dashboard, users, ads, reports, promotions, and AI health.
- Uses the existing Supabase session and requires profiles.role = admin.
- No SQL migration required.
