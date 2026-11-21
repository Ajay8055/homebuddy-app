-- Ensure the extensions used by the scheduled push worker are enabled.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
