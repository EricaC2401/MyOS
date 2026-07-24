alter table public.english_journal_entries
add column if not exists mood_score integer check (mood_score between 1 and 5);
