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
