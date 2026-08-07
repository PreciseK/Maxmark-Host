-- Migration: Sync current_slots in hosting_nodes table to match active user_sites count
UPDATE public.hosting_nodes n
SET current_slots = (
  SELECT COUNT(*)
  FROM public.user_sites s
  WHERE s.node_id = n.id
  AND s.status <> 'failed'
);
