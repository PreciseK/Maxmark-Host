-- Migration: Add UPDATE and DELETE policies for user_sites table
ALTER TABLE public.user_sites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can update their own sites" ON public.user_sites;
DROP POLICY IF EXISTS "Users can delete their own sites" ON public.user_sites;
DROP POLICY IF EXISTS "Authenticated users can update sites" ON public.user_sites;
DROP POLICY IF EXISTS "Authenticated users can delete sites" ON public.user_sites;

-- Allow authenticated users to update user_sites
CREATE POLICY "Authenticated users can update sites"
ON public.user_sites
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Allow authenticated users to delete user_sites
CREATE POLICY "Authenticated users can delete sites"
ON public.user_sites
FOR DELETE
TO authenticated
USING (true);
