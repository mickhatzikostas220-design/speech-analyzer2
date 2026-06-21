-- Stripe subscriptions + per-tool daily free limits.
-- Run this in the Supabase SQL editor (Dashboard > SQL Editor > New query).

-- One row per user. Written ONLY by the server (service role) from the Stripe
-- webhook — never by the user — so a free user can't make themselves Pro.
-- Pro = status in ('active','trialing'); anything else is treated as free.
create table if not exists subscriptions (
  user_id uuid primary key references profiles(id) on delete cascade,
  status text not null default 'free',
  stripe_customer_id text,
  stripe_subscription_id text,
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_customer_idx on subscriptions (stripe_customer_id);

-- Per-user, per-tool, per-day counter. A new day is a new row, so the limit
-- resets daily with no cron. Written only via consume_tool_credit() below.
create table if not exists tool_usage (
  user_id uuid references profiles(id) on delete cascade not null,
  tool text not null,
  day date not null default current_date,
  count integer not null default 0,
  primary key (user_id, tool, day)
);

alter table subscriptions enable row level security;
alter table tool_usage enable row level security;

-- Read-only to the owner; every write goes through the service role (which
-- bypasses RLS), so there are deliberately no insert/update policies for users.
create policy "Users read own subscription" on subscriptions for select using (auth.uid() = user_id);
create policy "Users read own usage" on tool_usage for select using (auth.uid() = user_id);

-- Atomic "may this user use <tool> once more today?". Pro users are unlimited and
-- never counted; everyone else is incremented and compared to p_limit. The whole
-- check+increment is one statement so concurrent calls can't overshoot the limit.
create or replace function consume_tool_credit(p_user uuid, p_tool text, p_limit int)
returns jsonb language plpgsql security definer as $$
declare
  v_status text;
  v_count int;
begin
  select status into v_status from subscriptions where user_id = p_user;
  if v_status in ('active', 'trialing') then
    return jsonb_build_object('allowed', true, 'pro', true);
  end if;

  insert into tool_usage (user_id, tool, day, count)
    values (p_user, p_tool, current_date, 1)
  on conflict (user_id, tool, day)
    do update set count = tool_usage.count + 1
  returning count into v_count;

  return jsonb_build_object('allowed', v_count <= p_limit, 'pro', false, 'count', v_count, 'limit', p_limit);
end;
$$;

-- Only the server may spend credits — stop a signed-in user from calling this
-- RPC directly to drain their own (or another user's) quota.
revoke all on function consume_tool_credit(uuid, text, int) from public, anon, authenticated;
grant execute on function consume_tool_credit(uuid, text, int) to service_role;
