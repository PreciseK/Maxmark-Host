-- Maxmark Host — Demo Seed Data
-- Run after the migrations in supabase/migrations/ (baseline: 00000000000000_schema.sql).
-- Replace DEMO_USER_EMAIL with the email of your Supabase auth user.
-- The seed is idempotent: re-running it is safe.

do $$
declare
  v_user_id     uuid;
  v_node_id     uuid;
  v_site1_id    uuid;
  v_site2_id    uuid;
  v_site3_id    uuid;
  v_plugin_cache_id       uuid;
  v_plugin_checkout_id    uuid;
  v_plugin_seo_id         uuid;
  v_plugin_shield_id      uuid;
  v_zone_id     uuid;
begin

  -- ── 1. Resolve demo user ────────────────────────────────────────────────
  select id into v_user_id
  from auth.users
  where email = 'maxmarkagency@gmail.com'
  limit 1;

  if v_user_id is null then
    raise notice 'Demo user not found. Create a Supabase auth user with email maxmarkagency@gmail.com first.';
    return;
  end if;

  -- ── 2. User profile ──────────────────────────────────────────────────────
  insert into public.user_profiles (user_id, display_name, account_id, support_pin)
  values (v_user_id, 'Gloria Belleboa', '144075', '144075')
  on conflict (user_id) do nothing;

  -- ── 3. Hosting node (one cPanel account) ─────────────────────────────────
  insert into public.hosting_nodes (id, cpanel_username, primary_domain, current_slots, status)
  values (
    gen_random_uuid(),
    'maxmarkwp01',
    'cloudhost-433832.uk-south-2.nxcli.net',
    3,
    'active'
  )
  on conflict (cpanel_username) do nothing;

  select id into v_node_id from public.hosting_nodes where cpanel_username = 'maxmarkwp01';

  -- ── 4. Demo sites ────────────────────────────────────────────────────────
  -- Site 1
  insert into public.user_sites (
    id, user_id, node_id, site_domain, db_name, db_user, document_root, status,
    plan, region, php_version, wordpress_version, daily_visits,
    cname_target, ip_address, ftp_hostname, home_directory,
    redis_ip, redis_port, cdn_endpoint,
    disk_used_gb, disk_capacity_gb, bandwidth_capacity_gb, bandwidth_included_gb,
    uptime_percent, php_workers, backups_summary
  ) values (
    gen_random_uuid(), v_user_id, v_node_id,
    'atelierandco.com', 'atelier_db', 'atelier_usr',
    '/home/maxmarkwp01/public_html/atelierandco.com', 'active',
    'Managed WordPress Pro', 'Lagos Edge', 'PHP 8.3', 'WP 6.8', 3241,
    '84dba1eae1.nxcli.io', '165.84.219.136', 'cloudhost-433832.uk-south-2.nxcli.net',
    '/home/maxmarkwp01',
    '10.75.48.79', 36654, 'eadn-wc05-12585164.nxedge.io',
    12.4, 40, 300, 250,
    99.98, 4, 'Daily'
  )
  on conflict (site_domain) do nothing;

  select id into v_site1_id from public.user_sites where site_domain = 'atelierandco.com';

  -- Site 2
  insert into public.user_sites (
    id, user_id, node_id, site_domain, db_name, db_user, document_root, status,
    plan, region, php_version, wordpress_version, daily_visits,
    cname_target, ip_address, ftp_hostname, home_directory,
    disk_used_gb, disk_capacity_gb, bandwidth_capacity_gb, bandwidth_included_gb,
    uptime_percent, php_workers, backups_summary
  ) values (
    gen_random_uuid(), v_user_id, v_node_id,
    'riverlinemedia.co', 'rivline_db', 'rivline_usr',
    '/home/maxmarkwp01/public_html/riverlinemedia.co', 'active',
    'Scale Plan', 'Frankfurt Cache', 'PHP 8.2', 'WP 6.7', 18540,
    'c8f3a2b1d0.nxcli.io', '178.33.41.209', 'cloudhost-433832.uk-south-2.nxcli.net',
    '/home/maxmarkwp01',
    18.9, 40, 300, 250,
    99.95, 8, 'Daily'
  )
  on conflict (site_domain) do nothing;

  select id into v_site2_id from public.user_sites where site_domain = 'riverlinemedia.co';

  -- Site 3
  insert into public.user_sites (
    id, user_id, node_id, site_domain, db_name, db_user, document_root, status,
    plan, region, php_version, wordpress_version, daily_visits,
    cname_target, ip_address, ftp_hostname, home_directory,
    disk_used_gb, disk_capacity_gb, bandwidth_capacity_gb, bandwidth_included_gb,
    uptime_percent, php_workers, backups_summary
  ) values (
    gen_random_uuid(), v_user_id, v_node_id,
    'copperstatelabs.dev', 'copper_db', 'copper_usr',
    '/home/maxmarkwp01/public_html/copperstatelabs.dev', 'active',
    'Launch Plan', 'London Edge', 'PHP 8.3', 'WP 6.8', 512,
    'f1e2d3c4b5.nxcli.io', '51.68.112.77', 'cloudhost-433832.uk-south-2.nxcli.net',
    '/home/maxmarkwp01',
    3.1, 20, 150, 100,
    100.00, 2, 'Daily'
  )
  on conflict (site_domain) do nothing;

  select id into v_site3_id from public.user_sites where site_domain = 'copperstatelabs.dev';

  -- ── 5. Site settings (one row per site) ──────────────────────────────────
  insert into public.site_settings (site_id, local_mail_delivery, core_upgrades, nginx_accelerator, auto_lets_encrypt, password_protection, php_workers)
  values
    (v_site1_id, true, true, true, true, false, 4),
    (v_site2_id, true, true, true, true, false, 8),
    (v_site3_id, true, false, true, true, false, 2)
  on conflict (site_id) do nothing;

  -- ── 6. SSL certificates ───────────────────────────────────────────────────
  insert into public.ssl_certificates (site_id, domain, status, expires_at, key_length, auto_renew, domains_included)
  values
    (v_site1_id, 'atelierandco.com', 'installed', now() + interval '87 days', 2048, true, '["www.atelierandco.com"]'),
    (v_site2_id, 'riverlinemedia.co', 'installed', now() + interval '42 days', 2048, true, '["www.riverlinemedia.co"]'),
    (v_site3_id, 'copperstatelabs.dev', 'installed', now() + interval '71 days', 2048, true, '[]')
  on conflict (site_id) do nothing;

  -- ── 7. Backup logs ────────────────────────────────────────────────────────
  insert into public.backup_logs (site_id, status, created_at)
  values
    (v_site1_id, 'completed', now() - interval '1 hour'),
    (v_site1_id, 'completed', now() - interval '25 hours'),
    (v_site1_id, 'completed', now() - interval '49 hours'),
    (v_site2_id, 'completed', now() - interval '2 hours'),
    (v_site2_id, 'completed', now() - interval '26 hours'),
    (v_site3_id, 'completed', now() - interval '3 hours');

  -- ── 8. Analytics snapshots (last 7 days, hourly) ─────────────────────────
  -- Simplified: insert a few representative data points
  insert into public.analytics_snapshots (site_id, metric, value, recorded_at)
  select
    v_site1_id,
    'php_fpm',
    (random() * 40 + 5)::numeric(10,4),
    now() - (n * interval '1 hour')
  from generate_series(0, 167) as n
  on conflict do nothing;

  insert into public.analytics_snapshots (site_id, metric, value, recorded_at)
  select
    v_site1_id,
    'web_stats',
    (random() * 500 + 50)::numeric(10,4),
    now() - (n * interval '1 hour')
  from generate_series(0, 167) as n
  on conflict do nothing;

  -- ── 9. Marketplace items (plugins + themes) ───────────────────────────────
  insert into public.marketplace_plugins (
    id, slug, name, tagline, description, category, product_type, tier, version,
    requires_wordpress, requires_php, price_ngn,
    featured, rating, installs_label, gradient, highlights, status
  ) values
  (
    gen_random_uuid(),
    'cache-pilot',
    'Cache Pilot',
    'Performance tuning without touching nginx rules or object cache manually.',
    'Cache Pilot layers full-page caching, asset fingerprinting, and route-aware warmup queues into a WordPress-first operational plugin.',
    'Performance', 'plugin', 2, '1.4.2', '6.4+', '8.1+', 130350.00,
    true, 4.9, '12.4k managed installs',
    'linear-gradient(135deg, rgba(18,29,28,0.95), rgba(44,76,72,0.9) 55%, rgba(217,188,117,0.78))',
    '["Edge-aware cache purge orchestration","Automatic WooCommerce exclusion rules","One-click warmup after deploy"]',
    'active'
  ),
  (
    gen_random_uuid(),
    'checkout-forge',
    'Checkout Forge',
    'Sharper WooCommerce conversions with premium post-purchase surfaces.',
    'Checkout Forge adds focused upsells, custom thank-you flows, and order segmentation designed for higher-value storefronts.',
    'Commerce', 'plugin', 3, '2.1.0', '6.5+', '8.1+', 212850.00,
    true, 4.8, '8.1k commerce sites',
    'linear-gradient(135deg, rgba(58,40,28,0.96), rgba(138,89,57,0.88) 52%, rgba(242,220,188,0.84))',
    '["Conversion-tested checkout blocks","Order bump analytics","Post-purchase offer routing"]',
    'active'
  ),
  (
    gen_random_uuid(),
    'seo-canvas',
    'SEO Canvas',
    'Content structure, schema, and on-page quality scoring in one suite.',
    'SEO Canvas helps editorial teams shape cleaner metadata, structured data, and internal linking with an interface made for growth teams.',
    'Growth', 'plugin', 1, '3.0.4', '6.3+', '8.0+', 97350.00,
    false, 4.7, '21k content teams',
    'linear-gradient(135deg, rgba(32,40,54,0.96), rgba(70,98,143,0.88) 52%, rgba(205,220,248,0.82))',
    '["Schema presets for posts and products","Internal linking suggestions","SERP preview composer"]',
    'active'
  ),
  (
    gen_random_uuid(),
    'shield-ops',
    'Shield Ops',
    'Login hardening, file integrity checks, and security posture reporting.',
    'Shield Ops packages security baselines for premium WordPress installs and gives clients clearer insight into suspicious activity.',
    'Security', 'plugin', 2, '1.9.1', '6.4+', '8.1+', 163350.00,
    false, 4.9, '16.3k protected sites',
    'linear-gradient(135deg, rgba(21,28,33,0.95), rgba(54,74,83,0.88) 55%, rgba(142,182,176,0.82))',
    '["File drift alerts and audit logs","Risk-based login hardening","Daily security digest"]',
    'active'
  ),
  (
    gen_random_uuid(),
    'atelier-noir',
    'Atelier Noir',
    'A moody editorial theme for studios, portfolios, and photography.',
    'Atelier Noir pairs oversized display typography with gallery-first layouts, dark-room color science, and effortless case-study templates.',
    'Growth', 'theme', 1, '1.2.0', '6.4+', '8.0+', 74250.00,
    false, 4.6, '5.8k studio sites',
    'linear-gradient(135deg, rgba(20,20,24,0.96), rgba(52,50,60,0.9) 55%, rgba(180,170,200,0.75))',
    '["Gallery-first case study layouts","Display typography presets","Dark-room color palettes"]',
    'active'
  ),
  (
    gen_random_uuid(),
    'storefront-lux',
    'Storefront Lux',
    'A conversion-tuned WooCommerce theme for premium retail brands.',
    'Storefront Lux ships editorial product pages, lookbook grids, and checkout-optimized templates built for high-consideration purchases.',
    'Commerce', 'theme', 2, '2.4.1', '6.5+', '8.1+', 145200.00,
    true, 4.8, '9.6k storefronts',
    'linear-gradient(135deg, rgba(40,30,26,0.96), rgba(110,80,60,0.88) 52%, rgba(235,210,180,0.8))',
    '["Lookbook and collection grids","Editorial product page blocks","Checkout-optimized templates"]',
    'active'
  ),
  (
    gen_random_uuid(),
    'editorial-prime',
    'Editorial Prime',
    'A flagship publishing theme for magazines and high-volume newsrooms.',
    'Editorial Prime delivers newsroom-grade article templates, curated front pages, and reading-experience tuning for serious publishers.',
    'Growth', 'theme', 3, '3.1.0', '6.5+', '8.1+', 198000.00,
    false, 4.9, '3.2k publications',
    'linear-gradient(135deg, rgba(24,30,40,0.96), rgba(60,80,110,0.9) 55%, rgba(200,215,240,0.8))',
    '["Curated front-page composer","Newsroom article templates","Reading-experience tuning"]',
    'active'
  )
  on conflict (slug) do nothing;

  select id into v_plugin_cache_id from public.marketplace_plugins where slug = 'cache-pilot';

  -- ── 10. Plugin purchase (Cache Pilot) ─────────────────────────────────────
  insert into public.plugin_purchases (
    user_id, plugin_id, license_key, amount_paid_ngn, acquisition,
    download_count, last_downloaded_at, status
  ) values (
    v_user_id, v_plugin_cache_id,
    'MM-CACHEPILOT-8D3A-5F71-XL2Q', 130350.00, 'purchase',
    2, now() - interval '15 days', 'active'
  )
  on conflict (license_key) do nothing;

  -- ── 11. Hosting plan ─────────────────────────────────────────────────────
  insert into public.hosting_plans (
    user_id, name, type, region, sites_limit, app_environment,
    price_ngn_yearly, renewal_date, status
  ) values (
    v_user_id,
    'WordPress VIP Plan',
    'VIP',
    'UK',
    1,
    'WordPress',
    189.96,
    '2027-03-14',
    'active'
  )
  on conflict do nothing;

  -- ── 12. Billing: invoices ────────────────────────────────────────────────
  insert into public.invoices (user_id, subscription_id, description, status, due_date, total_ngn)
  values
    (v_user_id, 'SUB-10921', 'WordPress VIP Plan — Annual', 'paid',   current_date - 30, 189.96),
    (v_user_id, 'SUB-10921', 'WordPress VIP Plan — Annual', 'unpaid', current_date + 335, 189.96),
    (v_user_id, null,        'Cache Pilot Plugin License',  'paid',   current_date - 15,  79.00)
  on conflict do nothing;

  -- ── 13. Billing: payments ────────────────────────────────────────────────
  insert into public.payments (user_id, transaction_id, payment_method_label, amount_ngn, status, paid_at)
  values
    (v_user_id, 'TXN-884421', 'Visa ending in 4111', 189.96, 'successful', now() - interval '30 days'),
    (v_user_id, 'TXN-891033', 'Visa ending in 4111',  79.00, 'successful', now() - interval '15 days')
  on conflict (transaction_id) do nothing;

  -- ── 14. Billing: payment methods ─────────────────────────────────────────
  insert into public.payment_methods (user_id, label, last_four, card_brand, expires_at, is_default)
  values (v_user_id, 'Visa ending in 4111', '4111', 'visa', '12/2027', true)
  on conflict do nothing;

  -- ── 15. Billing: orders ───────────────────────────────────────────────────
  insert into public.orders (user_id, order_ref, product, total_label, status, ordered_at)
  values
    (v_user_id, 'ORD-20260305-01', 'WordPress VIP Plan (Annual)', '$189.96', 'active', now() - interval '30 days'),
    (v_user_id, 'ORD-20260314-02', 'Cache Pilot Plugin License',  '$79.00',  'active', now() - interval '15 days')
  on conflict (order_ref) do nothing;

  -- ── 16. Billing: credits ─────────────────────────────────────────────────
  -- No credits initially — balance is $0.00 as shown in frontend

  -- ── 17. DNS zone for atelierandco.com ────────────────────────────────────
  insert into public.dns_zones (user_id, zone_name)
  values (v_user_id, 'atelierandco.com')
  on conflict (zone_name) do nothing;

  select id into v_zone_id from public.dns_zones where zone_name = 'atelierandco.com';

  insert into public.dns_records (zone_id, type, name, value, ttl)
  values
    (v_zone_id, 'A',     '@',   '165.84.219.136',              3600),
    (v_zone_id, 'A',     'www', '165.84.219.136',              3600),
    (v_zone_id, 'CNAME', 'mail','cloudhost-433832.uk-south-2.nxcli.net', 3600),
    (v_zone_id, 'MX',    '@',   'mail.atelierandco.com',       3600),
    (v_zone_id, 'TXT',   '@',   'v=spf1 include:_spf.nxcli.net ~all', 3600)
  on conflict do nothing;

  -- ── 18. Registered domain ─────────────────────────────────────────────────
  insert into public.registered_domains (user_id, domain, tld, status, expires_at, auto_renew, price_ngn_yearly)
  values (v_user_id, 'atelierandco.com', '.com', 'active', current_date + 240, true, 14.99)
  on conflict (domain) do nothing;

  raise notice 'Seed completed for user %', v_user_id;

end
$$;

-- ── First admin ──────────────────────────────────────────────────────────────
-- auth.users is environment-specific, so this cannot be seeded blindly.
-- After your admin account exists (sign in once via the app), run:
--
--   insert into public.user_roles (user_id, role)
--   select id, 'admin' from auth.users where email = 'you@example.com'
--   on conflict do nothing;
