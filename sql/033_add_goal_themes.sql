create table if not exists public.goal_themes (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    notes text,
    is_done boolean not null default false,
    is_cancelled boolean not null default false,
    is_active boolean not null default true,
    sort_order integer,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.goals
add column if not exists goal_theme_id uuid references public.goal_themes (id) on delete set null;

create index if not exists idx_goal_themes_sort_order
    on public.goal_themes (sort_order, created_at);

create index if not exists idx_goals_goal_theme_id
    on public.goals (goal_theme_id);

drop trigger if exists trg_goal_themes_updated_at on public.goal_themes;

create trigger trg_goal_themes_updated_at
before update on public.goal_themes
for each row
execute function public.set_updated_at();

alter table public.goal_themes enable row level security;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'goal_themes'
          and policyname = 'Allow all on goal_themes'
    ) then
        create policy "Allow all on goal_themes" on public.goal_themes
            for all using (true) with check (true);
    end if;
end $$;

with distinct_areas as (
    select distinct trim(area) as title
    from public.goals
    where trim(coalesce(area, '')) <> ''
)
insert into public.goal_themes (title, sort_order)
select da.title, row_number() over (order by da.title)
from distinct_areas da
where not exists (
    select 1
    from public.goal_themes gt
    where gt.title = da.title
);

insert into public.goal_themes (title, sort_order)
select 'Unassigned', 9999
where exists (
    select 1
    from public.goals
    where trim(coalesce(area, '')) = ''
)
and not exists (
    select 1
    from public.goal_themes
    where title = 'Unassigned'
);

update public.goals g
set goal_theme_id = gt.id
from public.goal_themes gt
where g.goal_theme_id is null
  and trim(coalesce(g.area, '')) <> ''
  and gt.title = trim(g.area);

update public.goals g
set goal_theme_id = gt.id
from public.goal_themes gt
where g.goal_theme_id is null
  and trim(coalesce(g.area, '')) = ''
  and gt.title = 'Unassigned';
