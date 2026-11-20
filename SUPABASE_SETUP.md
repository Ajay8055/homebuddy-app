# Supabase setup for HomeBuddy

This repository now includes a household database schema with Row Level Security (RLS).

## Required one-time setup

1. Create a free Supabase project at https://supabase.com/dashboard.
2. In the project, open **SQL Editor → New query**.
3. Copy the complete contents of `supabase/migrations/0001_initial_schema.sql` into the editor and run it.
4. Open **Project Settings → API** (or **Data API**) and copy the Project URL and the publishable/anon key. Never use the service_role or secret key in a browser app.
5. Add these as build environment variables wherever the frontend is hosted:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. In Supabase Authentication → URL Configuration, set the production Site URL to your deployed site and add the local development URL to Redirect URLs if needed.
7. For a first test, create two accounts and use the household invite code to join the same household. Verify that a third unrelated account cannot see either household's records.

## Security notes

- RLS is enabled on household and data tables.
- Household data reads and writes are limited to authenticated members of the matching household.
- The client must use only the publishable/anon key. Never expose a service-role key.
- The invite code is a bearer invitation: share it only with intended household members. Rotate/expire invitations before broad public use.
- Review auth email confirmation, password reset and rate limits before launch.

## Build / deployment

Build command: `npm run build`; output directory: `dist`.
