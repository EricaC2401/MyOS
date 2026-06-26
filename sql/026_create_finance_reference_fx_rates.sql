create table if not exists public.finance_reference_fx_rates (
    currency_code text primary key,
    rate_to_hkd numeric(18, 8) not null,
    source text,
    fetched_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

drop trigger if exists trg_finance_reference_fx_rates_updated_at on public.finance_reference_fx_rates;

create trigger trg_finance_reference_fx_rates_updated_at
before update on public.finance_reference_fx_rates
for each row
execute function public.set_updated_at();

alter table public.finance_reference_fx_rates enable row level security;
