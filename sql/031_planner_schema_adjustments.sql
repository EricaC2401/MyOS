-- Planner integration: rename categories table and add tag config
-- The planner tables (habits, habit_entries, categories, goals, tasks,
-- events, daily_plans, daily_plan_items) already exist from setup.sql.
-- This migration only makes adjustments needed for the merged app.

-- 1. Rename 'categories' to 'habit_categories' to avoid collision
--    with the expense tracker's 'category_catalog' table.
alter table if exists categories rename to habit_categories;

-- 2. Create planner tag configuration table
--    Stores areas, task_categories, event_categories as JSONB
--    (previously stored in browser localStorage).
create table if not exists planner_tag_config (
    id bigserial primary key,
    config_key text not null unique,
    config_value jsonb not null default '[]'::jsonb,
    updated_at timestamptz not null default now()
);

create trigger set_planner_tag_config_updated_at
    before update on planner_tag_config
    for each row execute function set_updated_at();

alter table planner_tag_config enable row level security;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'planner_tag_config'
          and policyname = 'Allow all on planner_tag_config'
    ) then
        create policy "Allow all on planner_tag_config" on planner_tag_config
            for all using (true) with check (true);
    end if;
end $$;

-- Seed default tag configuration
insert into planner_tag_config (config_key, config_value) values
('areas', '[{"label":"Finance","color":"chip-amber"},{"label":"Career & Skills","color":"chip-purple"},{"label":"Home Ownership","color":"chip-teal"},{"label":"Relationships & Love","color":"chip-coral"},{"label":"Health","color":"chip-green"},{"label":"Personal","color":"chip-gray"}]'::jsonb),
('task_categories', '[{"label":"Personal","color":"chip-teal"},{"label":"REF/ROI","color":"chip-amber"},{"label":"Work","color":"chip-purple"}]'::jsonb),
('event_categories', '[{"label":"Friends","color":"chip-purple"},{"label":"Family","color":"chip-rose"},{"label":"Work","color":"chip-blue"},{"label":"Social","color":"chip-green"}]'::jsonb)
on conflict (config_key) do nothing;
