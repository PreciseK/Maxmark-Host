# Migration order

Every SQL migration uses a unique 14-digit timestamp prefix and is applied in lexicographic filename order. This matches the ordering and uniqueness requirements of Supabase migration tooling, so `supabase db push` applies this directory as-is.

The baseline snapshot is `00000000000000_schema.sql`. Its all-zero prefix sorts first, so a new database gets the full schema before any incremental migration runs. The snapshot is idempotent (`if not exists` guards throughout), and the ordered migrations after it remain authoritative for any change made since.

Existing pre-production databases that manually applied the former short-numbered files should reconcile their history once with `supabase migration repair --status applied <timestamp>` before adopting automated `db push`; do not rerun already-applied SQL blindly.

Production deployments must record the migration version before Edge Functions or frontend code depending on that version are released.
