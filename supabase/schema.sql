create extension if not exists pgcrypto;

create table if not exists public.etfs (
  id uuid primary key default gen_random_uuid(),
  isin text unique not null,
  symbol text not null,
  name text not null,
  exchange text not null,
  currency text not null default 'EUR',
  pea_eligible boolean default false,
  active boolean default true,
  bourso_identifier text null,
  data_provider_symbol text null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(symbol, exchange)
);

create table if not exists public.price_points (
  id uuid primary key default gen_random_uuid(),
  etf_id uuid references public.etfs(id) on delete cascade,
  priced_at date not null,
  open_price numeric null,
  high_price numeric null,
  low_price numeric null,
  close_price numeric not null,
  adjusted_close_price numeric null,
  volume bigint null,
  source text not null,
  created_at timestamptz default now(),
  unique(etf_id, priced_at, source)
);

create index if not exists price_points_etf_priced_at_idx
  on public.price_points(etf_id, priced_at);

create table if not exists public.momentum_snapshots (
  id uuid primary key default gen_random_uuid(),
  etf_id uuid references public.etfs(id) on delete cascade,
  computed_at date not null,
  strategy_code text not null,
  score numeric not null,
  performance_1_month numeric null,
  performance_3_months numeric null,
  performance_6_months numeric null,
  performance_12_months numeric null,
  volatility_annualized numeric null,
  max_drawdown numeric null,
  moving_average_50 numeric null,
  moving_average_200 numeric null,
  distance_to_moving_average_200 numeric null,
  atr_14 numeric null,
  signal text not null check (signal in ('buy', 'watch', 'avoid')),
  details jsonb not null default '{}',
  created_at timestamptz default now(),
  unique(etf_id, computed_at, strategy_code)
);

create index if not exists momentum_snapshots_strategy_score_idx
  on public.momentum_snapshots(strategy_code, score);

alter table public.etfs enable row level security;
alter table public.price_points enable row level security;
alter table public.momentum_snapshots enable row level security;

create policy "personal read etfs" on public.etfs for select using (true);
create policy "personal write etfs" on public.etfs for all using (true) with check (true);

create policy "personal read price points" on public.price_points for select using (true);
create policy "personal write price points" on public.price_points for all using (true) with check (true);

create policy "personal read momentum snapshots" on public.momentum_snapshots for select using (true);
create policy "personal write momentum snapshots" on public.momentum_snapshots for all using (true) with check (true);
