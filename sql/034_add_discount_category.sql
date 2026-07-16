insert into public.category_catalog (category, group_name)
values ('Discount', 'Living')
on conflict (category, group_name) do nothing;
