create table if not exists public.recurring_task_templates (
    id bigserial primary key,
    title text not null,
    category text,
    area text,
    goal_id uuid references public.goals (id) on delete set null,
    repeat_unit text not null check (repeat_unit in ('daily', 'weekly', 'monthly')),
    repeat_every integer not null default 1 check (repeat_every > 0),
    weekday integer check (weekday between 0 and 6),
    day_of_month integer check (day_of_month between 1 and 31),
    start_date date not null,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint recurring_task_templates_rule_check check (
        (repeat_unit = 'daily' and weekday is null and day_of_month is null) or
        (repeat_unit = 'weekly' and weekday is not null and day_of_month is null) or
        (repeat_unit = 'monthly' and day_of_month is not null and weekday is null)
    )
);

alter table public.tasks
add column if not exists recurring_template_id bigint references public.recurring_task_templates (id) on delete set null,
add column if not exists recurring_occurrence_date date;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'tasks_recurring_occurrence_unique'
    ) then
        alter table public.tasks
        add constraint tasks_recurring_occurrence_unique
        unique (recurring_template_id, recurring_occurrence_date);
    end if;
end;
$$;

create index if not exists idx_tasks_recurring_template
    on public.tasks (recurring_template_id, recurring_occurrence_date);

drop trigger if exists trg_recurring_task_templates_updated_at on public.recurring_task_templates;

create trigger trg_recurring_task_templates_updated_at
before update on public.recurring_task_templates
for each row
execute function public.set_updated_at();

alter table public.recurring_task_templates enable row level security;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'recurring_task_templates'
          and policyname = 'Allow all on recurring_task_templates'
    ) then
        create policy "Allow all on recurring_task_templates" on public.recurring_task_templates
            for all using (true) with check (true);
    end if;
end $$;
