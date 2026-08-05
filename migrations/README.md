# Migration order

Every SQL migration uses a unique 14-digit timestamp prefix and is applied in lexicographic filename order. This matches the ordering and uniqueness requirements of Supabase migration tooling.

For a new database, apply `schema.sql` first and then the full ordered migration set. Existing pre-production databases that manually applied the former short-numbered files should reconcile their history once with `supabase migration repair --status applied <timestamp>` before adopting automated `db push`; do not rerun already-applied SQL blindly.

Production deployments must record the migration version before Edge Functions or frontend code depending on that version are released.
