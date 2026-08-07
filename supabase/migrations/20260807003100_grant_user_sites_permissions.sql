-- Migration: Re-grant UPDATE and DELETE permissions on public.user_sites to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_sites TO authenticated, anon, service_role;

-- Ensure RLS is enabled
ALTER TABLE public.user_sites ENABLE ROW LEVEL SECURITY;

-- Re-create UPDATE and DELETE policies for authenticated users and admins
DROP POLICY IF EXISTS "Users can update their own sites" ON public.user_sites;
DROP POLICY IF EXISTS "Users can delete their own sites" ON public.user_sites;
DROP POLICY IF EXISTS "Authenticated users can update sites" ON public.user_sites;
DROP POLICY IF EXISTS "Authenticated users can delete sites" ON public.user_sites;

CREATE POLICY "Authenticated users can update sites"
ON public.user_sites
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete sites"
ON public.user_sites
FOR DELETE
TO authenticated
USING (true);
