-- Super-group classifications for expense analysis/visualisation

create table if not exists public.classification_groups (
    id bigserial primary key,
    name text not null unique,
    color text not null default '#8492a6',
    sort_order int not null default 0
);

create table if not exists public.classification_mappings (
    id bigserial primary key,
    classification_group_id bigint not null references public.classification_groups(id) on delete cascade,
    expense_group text not null,
    expense_category text,
    constraint classification_mappings_unique unique (expense_group, expense_category)
);

-- Seed default super-groups
insert into public.classification_groups (name, color, sort_order) values
    ('Tax',                  '#C47A7A', 1),
    ('Housing',              '#5B6C9E', 2),
    ('Driving Related',      '#7C8FB8', 3),
    ('Necessaries',          '#8DAA5B', 4),
    ('Other Living Expense', '#C6925B', 5),
    ('Family',               '#B07AA1', 6),
    ('UK Settlement',        '#5D98B3', 7),
    ('One-Off',              '#8E79B7', 8),
    ('Travel',               '#7A8DA8', 9)
on conflict (name) do nothing;

-- Seed default mappings
-- Tax
insert into public.classification_mappings (classification_group_id, expense_group, expense_category)
select g.id, m.expense_group, m.expense_category
from public.classification_groups g
cross join (values
    ('TaxPayment', null),
    ('Tax Payment', null)
) as m(expense_group, expense_category)
where g.name = 'Tax'
on conflict (expense_group, expense_category) do nothing;

-- Housing (specific category within Living)
insert into public.classification_mappings (classification_group_id, expense_group, expense_category)
select g.id, 'Living', 'Housing'
from public.classification_groups g
where g.name = 'Housing'
on conflict (expense_group, expense_category) do nothing;

-- Driving Related
insert into public.classification_mappings (classification_group_id, expense_group, expense_category)
select g.id, m.expense_group, m.expense_category
from public.classification_groups g
cross join (values
    ('Living', 'Car Related: Fuel'),
    ('Living', 'Car Related: Parking'),
    ('Living', 'Car Related: Annual'),
    ('Living', 'Car Related: One-off'),
    ('Living', 'Car Related: Other'),
    ('Living', 'Learning to Drive')
) as m(expense_group, expense_category)
where g.name = 'Driving Related'
on conflict (expense_group, expense_category) do nothing;

-- Necessaries
insert into public.classification_mappings (classification_group_id, expense_group, expense_category)
select g.id, m.expense_group, m.expense_category
from public.classification_groups g
cross join (values
    ('Living', 'Food'),
    ('Living', 'Groceries'),
    ('Living', 'C Groceries'),
    ('Living', 'Drink'),
    ('Living', 'Snacks')
) as m(expense_group, expense_category)
where g.name = 'Necessaries'
on conflict (expense_group, expense_category) do nothing;

-- Other Living Expense (group-level catch-all for Living)
insert into public.classification_mappings (classification_group_id, expense_group, expense_category)
select g.id, 'Living', null
from public.classification_groups g
where g.name = 'Other Living Expense'
on conflict (expense_group, expense_category) do nothing;

-- Family
insert into public.classification_mappings (classification_group_id, expense_group, expense_category)
select g.id, 'Family', null
from public.classification_groups g
where g.name = 'Family'
on conflict (expense_group, expense_category) do nothing;

-- UK Settlement
insert into public.classification_mappings (classification_group_id, expense_group, expense_category)
select g.id, 'UK Settlement', null
from public.classification_groups g
where g.name = 'UK Settlement'
on conflict (expense_group, expense_category) do nothing;

-- One-Off
insert into public.classification_mappings (classification_group_id, expense_group, expense_category)
select g.id, 'Large One-off', null
from public.classification_groups g
where g.name = 'One-Off'
on conflict (expense_group, expense_category) do nothing;

-- Travel
insert into public.classification_mappings (classification_group_id, expense_group, expense_category)
select g.id, 'Travel', null
from public.classification_groups g
where g.name = 'Travel'
on conflict (expense_group, expense_category) do nothing;

alter table public.classification_groups enable row level security;
alter table public.classification_mappings enable row level security;
