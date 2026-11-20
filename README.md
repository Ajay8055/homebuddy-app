# HomeBuddy

**One app. Every household. Everything organised.**

A responsive household organiser for shopping lists, bills, chores and home maintenance.

## Run locally

```bash
npm install
npm run dev
```

Build with `npm run build`; deploy the `dist` folder as a Vite static site.

## MVP status

The current MVP stores data in the current browser using localStorage. It is a prototype, not yet a multi-user production service. Data does not sync across devices or household members. Do not enter sensitive information. Supabase environment placeholders are included, but authentication, database tables, household sharing and Row Level Security have not yet been implemented. The quick-add helper uses local keyword rules, not a cloud AI API.

## Deploy

Cloudflare Pages build command: `npm run build`; output directory: `dist`.
