alter table public.finance_reference_fx_rates
add column if not exists id bigserial;

do $$
begin
    if exists (
        select 1
        from information_schema.table_constraints
        where table_schema = 'public'
          and table_name = 'finance_reference_fx_rates'
          and constraint_name = 'finance_reference_fx_rates_pkey'
    ) then
        alter table public.finance_reference_fx_rates
        drop constraint finance_reference_fx_rates_pkey;
    end if;
exception
    when undefined_table then
        null;
end $$;

do $$
begin
    alter table public.finance_reference_fx_rates
    add constraint finance_reference_fx_rates_pkey primary key (id);
exception
    when duplicate_object then
        null;
    when undefined_table then
        null;
end $$;

create index if not exists idx_finance_reference_fx_rates_latest
on public.finance_reference_fx_rates (currency_code, fetched_at desc, id desc);
