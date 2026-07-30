# Maxmark Host

Managed WordPress hosting control panel. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full system design.

## Admin console & support chat setup

The app ships with a role-guarded admin console at `/admin` and a realtime support chat (floating widget + `/support` page + admin inbox). Without Supabase env vars everything — including `/admin` — renders from mock data (demo mode), so **real deployments must set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`**; otherwise anyone can browse the (fake-data) admin UI.

To go live:

1. **Apply the schema.** Run `migrations/002_admin_roles.sql`, then re-run `schema.sql` (idempotent — installs `user_roles`, `is_admin()`, `admin_audit_log`, all admin RLS policies, the support chat tables/triggers, and the realtime publication entries). `migrations/003_support_chat.sql` documents the chat objects.
2. **Seed the first admin** (after that account has signed in once):

   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'admin' from auth.users where email = 'you@example.com'
   on conflict do nothing;
   ```

3. **Deploy the admin Edge Function:**

   ```sh
   supabase functions deploy admin-actions
   ```

4. **Verify realtime** is enabled for chat:

   ```sql
   select tablename from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public';
   -- must include support_messages and support_conversations
   ```

Admin reads use RLS (`is_admin()` SELECT policies); all admin writes go through `admin-actions` and land in `admin_audit_log`.

## Cloudflare R2 setup

Storage (marketplace ZIPs, chat attachments, avatars) uses two R2 buckets accessed via presigned URLs from Supabase Edge Functions. Nothing works until this is configured — until then, marketplace downloads use the built-in jszip mock, chat attachments/avatars are local-preview only.

1. In the Cloudflare dashboard, create two R2 buckets: `maxmark-private` and `maxmark-public`.
2. Enable public access on `maxmark-public` (custom domain or the `r2.dev` subdomain) and note the base URL.
3. Create one R2 API token scoped to Object Read & Write on both buckets. Note the Access Key ID and Secret Access Key.
4. Apply this CORS policy to both buckets (Cloudflare dashboard → bucket → Settings → CORS Policy), substituting your actual app origin(s):

   ```json
   [
     {
       "AllowedOrigins": ["https://your-app-domain.example", "http://localhost:5173"],
       "AllowedMethods": ["GET", "PUT"],
       "AllowedHeaders": ["Content-Type", "Content-Length"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

5. Set the Edge Function secrets:

   ```bash
   supabase secrets set R2_ACCOUNT_ID=<your-account-id>
   supabase secrets set R2_ACCESS_KEY_ID=<key-id>
   supabase secrets set R2_SECRET_ACCESS_KEY=<secret>
   supabase secrets set R2_PRIVATE_BUCKET=maxmark-private
   supabase secrets set R2_PUBLIC_BUCKET=maxmark-public
   supabase secrets set R2_PUBLIC_BASE_URL=<public bucket base URL from step 2>
   ```

6. Deploy the new/updated functions:

   ```bash
   supabase functions deploy storage
   supabase functions deploy admin-actions
   ```

7. Run `migrations/004_r2_storage.sql` and `migrations/006_marketplace_asset_flag.sql` against your database (or re-run `schema.sql`, which is idempotent and includes the same columns) **before** deploying the frontend build. The marketplace fetch selects a generated `has_download_asset` column added by migration 006 — deploying the frontend first causes that query to fail and the app to silently fall back to demo data app-wide until the migration lands.

---

## Vite template notes (React + TypeScript + Vite)

This project started from the Vite template, which provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

### React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

### Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
