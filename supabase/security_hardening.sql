-- Security & performance hardening applied to the live Supabase project.
-- Recorded here so the repo reflects production. These were applied via
-- migrations (see `supabase migration list`): optimize_rls_auth_uid_initplan,
-- revoke_execute_guard_profile_billing,
-- tighten_access_requests_and_brand_assets_policies.

-- 1) Performance: evaluate auth.uid() once per query, not per row
--    (Supabase advisor 0003 auth_rls_initplan). Semantically identical.
--    Applied to: aeo_settings, aeo_tips, gigs, and all clipflow_* tables by
--    wrapping `auth.uid()` as `(select auth.uid())` in every policy. Example:
--      create policy "Users view own gigs" on public.gigs
--        for select using ((select auth.uid()) = user_id);

-- 2) Security: stop exposing the billing-guard trigger function via the REST API
--    (advisors 0028/0029). It is a SECURITY DEFINER *trigger* function and is
--    never meant to be called directly; the trigger still fires regardless.
revoke execute on function public.guard_profile_billing() from public;
revoke execute on function public.guard_profile_billing() from anon;
revoke execute on function public.guard_profile_billing() from authenticated;

-- 3) Security: constrain public access-request inserts to status='pending' so the
--    REST API can't be used to insert a pre-'approved' row (advisor 0024). The
--    public form omits status and relies on the column default, so it is
--    unaffected.
drop policy if exists "Anyone can submit request" on public.access_requests;
create policy "Anyone can submit request" on public.access_requests
  for insert with check (status = 'pending');

-- 4) Security: brand-assets is a PUBLIC bucket (objects serve via public URL with
--    no RLS). The previous broad SELECT policy also let any client *list* every
--    file in the bucket (advisor 0025). Scope SELECT to the owning user's folder;
--    public URL rendering is unaffected.
drop policy if exists "Public read brand assets" on storage.objects;
create policy "Users read own brand assets" on storage.objects
  for select using (
    bucket_id = 'brand-assets'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

-- 5) MANUAL (not SQL): enable Leaked Password Protection (HaveIBeenPwned) in
--    Supabase Dashboard → Authentication → Policies. Cannot be toggled via SQL.
