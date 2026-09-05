# Maxmark Host

Modern web and managed cloud hosting platform built with React, Supabase Edge Functions, Paystack, cPanel/WHM, and Cloudflare R2. Supports WordPress, Node.js, Next.js, and static sites with automated GitHub CI/CD, MySQL/PostgreSQL databases, and live DNS management. See [ARCHITECTURE.md](ARCHITECTURE.md) for the system design.

## Local development

Copy `.env.example` to `.env.local` and fill in real Supabase values. There is no sample-data mode: if `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing or still a placeholder, the app renders a blocking configuration error rather than substituting mock data.

```sh
npm ci
npm run dev
```

## Production deployment checklist

1. Apply every file in `supabase/migrations/` in filename order — `supabase db push` does this for you. The all-zero-prefixed `00000000000000_schema.sql` sorts first and lays down the baseline schema for a new database. Existing installations apply only migrations not yet recorded, including `20260731000800_production_hardening.sql`.
2. Seed the first administrator after that account signs in:

   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'admin' from auth.users where email = 'you@example.com'
   on conflict do nothing;
   ```

3. Set Edge Function secrets from `.env.example`. Production requires `APP_ENV=production`, `MOCK_WHM_REQUESTS=false`, a Paystack secret key, WHM credentials, and the HTTPS WordPress installer integration. The application rejects mock WHM provisioning in production.
4. Configure the private and public R2 buckets and set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PRIVATE_BUCKET`, `R2_PUBLIC_BUCKET`, and `R2_PUBLIC_BASE_URL`.
5. Deploy all functions:

   ```sh
   supabase functions deploy admin-actions
   supabase functions deploy claim-item
   supabase functions deploy initialize-payment
   supabase functions deploy paystack-webhook --no-verify-jwt
   supabase functions deploy provision-site
   supabase functions deploy storage
   supabase functions deploy verify-payment
   ```

6. Configure Paystack live mode, ensure `APP_URL` is the exact HTTPS customer-app origin, and set the Paystack webhook URL to `https://<project-ref>.supabase.co/functions/v1/paystack-webhook`. The webhook is deployed without Supabase JWT verification because Paystack cannot provide a user token; the function instead verifies Paystack's HMAC-SHA512 signature over the raw request body. Initialization and settlement are server-side, and the browser never receives a secret key or supplies an amount.
7. Build and validate before release:

   ```sh
   npm ci
   npm run check
   npm audit --omit=dev
   ```

The repository contains route rewrites for Netlify (`public/_redirects`) and Vercel (`vercel.json`). Preserve equivalent `/app.html` rewrites and security headers on other hosts.

## WordPress installer contract

The configured installer endpoint receives an authenticated JSON `POST`. `action: "install"` includes the domain, document root, database name, database user, and generated database password. `action: "remove"` includes the domain for rollback. Both operations must return HTTP success with `{ "success": true }`; credentials must never be logged. cPanel AutoSSL starts only after installation succeeds.

## Operational notes

- Customer and admin inventory is fail-closed: live fetch failures show empty/error states and never substitute sample accounts.
- Payment intents are canonical, user-bound, amount-checked, and settled once in a row-locking SQL function.
- Site provisioning reserves both plan quota and node capacity before remote work and releases them on rollback.
- Legal copy in `src/pages/legal-page.tsx` is a functional baseline; have qualified counsel validate it for the operating entity and jurisdictions before launch.
