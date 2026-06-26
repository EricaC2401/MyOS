create index if not exists idx_finance_snapshot_entries_account_updated_latest
on public.finance_snapshot_entries (
    institution,
    account,
    currency,
    updated_at desc,
    id desc
);
