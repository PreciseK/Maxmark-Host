-- Migration: 20260806001000_admin_system_tables.sql
-- Description: Create persistent backend tables for System Settings, IP Firewall, Announcement Banners, and DNS Records.

-- 1. System Settings Table
CREATE TABLE IF NOT EXISTS public.system_settings (
  id text PRIMARY KEY DEFAULT 'default',
  maintenance_mode boolean NOT NULL DEFAULT false,
  provisioning_paused boolean NOT NULL DEFAULT false,
  under_attack_mode boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Seed initial row
INSERT INTO public.system_settings (id, maintenance_mode, provisioning_paused, under_attack_mode)
VALUES ('default', false, false, false)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS for system_settings
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to system settings"
  ON public.system_settings FOR SELECT
  USING (true);

CREATE POLICY "Allow admins to update system settings"
  ON public.system_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- 2. IP Firewall Rules Table
CREATE TABLE IF NOT EXISTS public.ip_firewall_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip text NOT NULL,
  type text NOT NULL CHECK (type IN ('block', 'allow')),
  reason text NOT NULL,
  created_by text NOT NULL DEFAULT 'Administrator',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS for ip_firewall_rules
ALTER TABLE public.ip_firewall_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read to ip_firewall_rules"
  ON public.ip_firewall_rules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow admins to modify ip_firewall_rules"
  ON public.ip_firewall_rules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- 3. Broadcast Announcement Banners Table
CREATE TABLE IF NOT EXISTS public.broadcast_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  tone text NOT NULL DEFAULT 'info' CHECK (tone IN ('info', 'warning', 'critical')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS for broadcast_banners
ALTER TABLE public.broadcast_banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to broadcast banners"
  ON public.broadcast_banners FOR SELECT
  USING (true);

CREATE POLICY "Allow admins to modify broadcast_banners"
  ON public.broadcast_banners FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- 4. Authoritative DNS Records Table
CREATE TABLE IF NOT EXISTS public.dns_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id text,
  domain_name text NOT NULL,
  type text NOT NULL CHECK (type IN ('A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA')),
  name text NOT NULL DEFAULT '@',
  content text NOT NULL,
  ttl integer NOT NULL DEFAULT 3600,
  priority integer,
  proxied boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS for dns_records
ALTER TABLE public.dns_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow users to read their domain DNS records"
  ON public.dns_records FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow admins to manage dns_records"
  ON public.dns_records FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
