-- Income source colors and classification groups

create table if not exists public.income_classification_groups (
    id bigserial primary key,
    name text not null unique,
    color text not null default '#8492a6',
    sort_order int not null default 0
);

create table if not exists public.income_source_config (
    id bigserial primary key,
    source_name text not null unique,
    color text not null default '#8492a6',
    income_classification_group_id bigint references public.income_classification_groups(id) on delete set null
);

-- Seed default classification groups
insert into public.income_classification_groups (name, color, sort_order) values
    ('Fixed',   '#5B93D3', 1),
    ('Freelance',    '#6DBE6D', 2),
    ('Investment',   '#C4A24E', 3),
    ('Other Income', '#8492a6', 4)
on conflict (name) do nothing;

-- Seed source configs from existing income data
insert into public.income_source_config (source_name, color, income_classification_group_id)
select distinct
    i.source,
    case
        when lower(i.source) in ('job', 'employer', 'salary') then '#5B93D3'
        when lower(i.source) in ('freelance', 'contract') then '#6DBE6D'
        else '#8492a6'
    end,
    case
        when lower(i.source) in ('job', 'employer', 'salary') then (select id from public.income_classification_groups where name = 'Fixed')
        when lower(i.source) in ('freelance', 'contract') then (select id from public.income_classification_groups where name = 'Freelance')
        else (select id from public.income_classification_groups where name = 'Other Income')
    end
from public.income_transactions i
where coalesce(trim(i.source), '') <> ''
on conflict (source_name) do nothing;

alter table public.income_classification_groups enable row level security;
alter table public.income_source_config enable row level security;
