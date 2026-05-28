-- ============================================================
-- ProfitPilot — Payment & Subscription Schema
-- Migration: 001_payment_tables
-- ============================================================

-- ─── Enum types ───────────────────────────────────────────────────────────────

create type payment_status as enum ('pending', 'approved', 'rejected');
create type payment_method as enum ('moncash', 'natcash', 'visa');
create type subscription_status as enum ('active', 'cancelled', 'expired', 'pending');

-- ─── pricing_plans ────────────────────────────────────────────────────────────

create table if not exists pricing_plans (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,        -- 'Ti Machann', 'Business Pilot', 'Expert'
  price_htg   integer not null,
  price_usd   numeric(10,2) not null,
  features    jsonb not null default '[]',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

insert into pricing_plans (key, price_htg, price_usd, features) values
  ('Ti Machann',     1000, 12.00, '["Ventes en temps réel","Suivi des stocks","Support de base"]'),
  ('Business Pilot', 2500, 30.00, '["Tout Ti Machann","Dashboard avancé","Gestion d''équipe","Rapports détaillés"]'),
  ('Expert',         7500, 90.00, '["Tout Business Pilot","Support prioritaire","Analyses avancées","Automatisation"]')
on conflict (key) do nothing;

-- ─── payments ─────────────────────────────────────────────────────────────────

create table if not exists payments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users(id) on delete cascade,
  plan_key       text not null references pricing_plans(key),
  payment_method payment_method not null,
  amount_htg     integer not null,
  reference      text not null unique,
  status         payment_status not null default 'pending',
  notes          text,                    -- admin notes
  reviewed_by    uuid references auth.users(id),
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists payments_user_id_idx   on payments(user_id);
create index if not exists payments_status_idx    on payments(status);
create index if not exists payments_reference_idx on payments(reference);
create index if not exists payments_created_at_idx on payments(created_at desc);

-- ─── subscriptions ────────────────────────────────────────────────────────────

create table if not exists subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  plan_key    text not null references pricing_plans(key),
  payment_id  uuid references payments(id),
  status      subscription_status not null default 'pending',
  starts_at   timestamptz,
  expires_at  timestamptz,
  cancelled_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists subscriptions_user_id_idx  on subscriptions(user_id);
create index if not exists subscriptions_status_idx   on subscriptions(status);
create index if not exists subscriptions_expires_at_idx on subscriptions(expires_at);

-- ─── invoices ─────────────────────────────────────────────────────────────────

create table if not exists invoices (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  subscription_id  uuid references subscriptions(id),
  payment_id       uuid references payments(id),
  amount_htg       integer not null,
  reference        text not null,
  issued_at        timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

create index if not exists invoices_user_id_idx on invoices(user_id);

-- ─── Auto-update updated_at ───────────────────────────────────────────────────

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger payments_updated_at
  before update on payments
  for each row execute procedure set_updated_at();

create trigger subscriptions_updated_at
  before update on subscriptions
  for each row execute procedure set_updated_at();

create trigger pricing_plans_updated_at
  before update on pricing_plans
  for each row execute procedure set_updated_at();

-- ─── RLS Policies ────────────────────────────────────────────────────────────

alter table pricing_plans  enable row level security;
alter table payments       enable row level security;
alter table subscriptions  enable row level security;
alter table invoices       enable row level security;

-- pricing_plans: public read
create policy "pricing_plans_public_read"
  on pricing_plans for select using (true);

-- payments: users see their own, service role sees all
create policy "payments_own_read"
  on payments for select
  using (auth.uid() = user_id);

create policy "payments_own_insert"
  on payments for insert
  with check (auth.uid() = user_id or user_id::text = 'anonymous');

-- subscriptions: users see their own
create policy "subscriptions_own_read"
  on subscriptions for select
  using (auth.uid() = user_id);

-- invoices: users see their own
create policy "invoices_own_read"
  on invoices for select
  using (auth.uid() = user_id);
