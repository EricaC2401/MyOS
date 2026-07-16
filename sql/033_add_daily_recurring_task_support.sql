alter table public.recurring_task_templates
drop constraint if exists recurring_task_templates_repeat_unit_check;

alter table public.recurring_task_templates
add constraint recurring_task_templates_repeat_unit_check
check (repeat_unit in ('daily', 'weekly', 'monthly'));

alter table public.recurring_task_templates
drop constraint if exists recurring_task_templates_rule_check;

alter table public.recurring_task_templates
add constraint recurring_task_templates_rule_check
check (
    (repeat_unit = 'daily' and weekday is null and day_of_month is null) or
    (repeat_unit = 'weekly' and weekday is not null and day_of_month is null) or
    (repeat_unit = 'monthly' and day_of_month is not null and weekday is null)
);
