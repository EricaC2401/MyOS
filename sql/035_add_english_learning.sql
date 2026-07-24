create table if not exists public.english_journal_entries (
    id uuid primary key default gen_random_uuid(),
    entry_date date not null default current_date,
    prompt text,
    content text not null,
    clarity_notes text,
    vocabulary_notes text,
    grammar_notes text,
    confidence_score integer check (confidence_score between 1 and 5),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.english_writing_issues (
    id uuid primary key default gen_random_uuid(),
    journal_entry_id uuid not null references public.english_journal_entries (id) on delete cascade,
    issue_type text not null,
    original_text text,
    suggested_text text,
    explanation text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.english_reading_books (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    current_page integer not null default 0 check (current_page >= 0),
    total_pages integer check (total_pages is null or total_pages > 0),
    status text not null default 'reading' check (status in ('reading', 'completed')),
    last_updated_date date not null default current_date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.english_listening_sources (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    source_type text not null default 'podcast',
    url text,
    notes text,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.english_listening_sessions (
    id uuid primary key default gen_random_uuid(),
    source_id uuid references public.english_listening_sources (id) on delete set null,
    session_date date not null default current_date,
    focus_area text,
    notes text,
    reflection text,
    difficulty_score integer check (difficulty_score between 1 and 5),
    second_pass_completed boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.english_word_lookups (
    id uuid primary key default gen_random_uuid(),
    phrase text not null,
    meaning text,
    meaning_cantonese text,
    example_sentence text,
    source_context text,
    status text not null default 'inbox' check (status in ('inbox', 'active', 'archived')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.english_vocabulary_items (
    id uuid primary key default gen_random_uuid(),
    lookup_id uuid references public.english_word_lookups (id) on delete set null,
    phrase text not null,
    meaning text,
    meaning_cantonese text,
    example_sentence text,
    status text not null default 'active' check (status in ('active', 'paused', 'mastered')),
    next_review_date date not null default current_date,
    last_reviewed_at timestamptz,
    review_stage integer not null default 0 check (review_stage >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.english_vocabulary_reviews (
    id uuid primary key default gen_random_uuid(),
    vocabulary_item_id uuid not null references public.english_vocabulary_items (id) on delete cascade,
    review_date date not null default current_date,
    confidence_score integer not null check (confidence_score between 1 and 5),
    result text not null default 'completed' check (result in ('completed', 'again', 'hard', 'easy')),
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.english_speaking_sessions (
    id uuid primary key default gen_random_uuid(),
    topic text not null,
    prompt text,
    attempt_one_notes text,
    attempt_two_notes text,
    reflection text,
    session_date date not null default current_date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.english_interview_questions (
    id uuid primary key default gen_random_uuid(),
    question text not null,
    category text,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.english_interview_practice (
    id uuid primary key default gen_random_uuid(),
    question_id uuid references public.english_interview_questions (id) on delete set null,
    practice_date date not null default current_date,
    answer_notes text,
    follow_up_notes text,
    confidence_score integer check (confidence_score between 1 and 5),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.english_star_stories (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    situation text not null,
    task text not null,
    action text not null,
    result text not null,
    target_skill text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.english_weekly_reviews (
    id uuid primary key default gen_random_uuid(),
    week_start_date date not null unique,
    summary text,
    wins text,
    stretch_area text,
    next_focus text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_english_journal_entries_entry_date
    on public.english_journal_entries (entry_date desc, created_at desc);

create index if not exists idx_english_reading_books_status
    on public.english_reading_books (status, updated_at desc);

create index if not exists idx_english_listening_sessions_date
    on public.english_listening_sessions (session_date desc, created_at desc);

create index if not exists idx_english_word_lookups_status
    on public.english_word_lookups (status, updated_at desc);

create index if not exists idx_english_vocabulary_items_status_due
    on public.english_vocabulary_items (status, next_review_date asc, updated_at desc);

create index if not exists idx_english_vocabulary_reviews_item_date
    on public.english_vocabulary_reviews (vocabulary_item_id, review_date desc);

create index if not exists idx_english_speaking_sessions_date
    on public.english_speaking_sessions (session_date desc, created_at desc);

create index if not exists idx_english_interview_practice_date
    on public.english_interview_practice (practice_date desc, created_at desc);

drop trigger if exists trg_english_journal_entries_updated_at on public.english_journal_entries;
create trigger trg_english_journal_entries_updated_at
before update on public.english_journal_entries
for each row
execute function public.set_updated_at();

drop trigger if exists trg_english_writing_issues_updated_at on public.english_writing_issues;
create trigger trg_english_writing_issues_updated_at
before update on public.english_writing_issues
for each row
execute function public.set_updated_at();

drop trigger if exists trg_english_reading_books_updated_at on public.english_reading_books;
create trigger trg_english_reading_books_updated_at
before update on public.english_reading_books
for each row
execute function public.set_updated_at();

drop trigger if exists trg_english_listening_sources_updated_at on public.english_listening_sources;
create trigger trg_english_listening_sources_updated_at
before update on public.english_listening_sources
for each row
execute function public.set_updated_at();

drop trigger if exists trg_english_listening_sessions_updated_at on public.english_listening_sessions;
create trigger trg_english_listening_sessions_updated_at
before update on public.english_listening_sessions
for each row
execute function public.set_updated_at();

drop trigger if exists trg_english_word_lookups_updated_at on public.english_word_lookups;
create trigger trg_english_word_lookups_updated_at
before update on public.english_word_lookups
for each row
execute function public.set_updated_at();

drop trigger if exists trg_english_vocabulary_items_updated_at on public.english_vocabulary_items;
create trigger trg_english_vocabulary_items_updated_at
before update on public.english_vocabulary_items
for each row
execute function public.set_updated_at();

drop trigger if exists trg_english_vocabulary_reviews_updated_at on public.english_vocabulary_reviews;
create trigger trg_english_vocabulary_reviews_updated_at
before update on public.english_vocabulary_reviews
for each row
execute function public.set_updated_at();

drop trigger if exists trg_english_speaking_sessions_updated_at on public.english_speaking_sessions;
create trigger trg_english_speaking_sessions_updated_at
before update on public.english_speaking_sessions
for each row
execute function public.set_updated_at();

drop trigger if exists trg_english_interview_questions_updated_at on public.english_interview_questions;
create trigger trg_english_interview_questions_updated_at
before update on public.english_interview_questions
for each row
execute function public.set_updated_at();

drop trigger if exists trg_english_interview_practice_updated_at on public.english_interview_practice;
create trigger trg_english_interview_practice_updated_at
before update on public.english_interview_practice
for each row
execute function public.set_updated_at();

drop trigger if exists trg_english_star_stories_updated_at on public.english_star_stories;
create trigger trg_english_star_stories_updated_at
before update on public.english_star_stories
for each row
execute function public.set_updated_at();

drop trigger if exists trg_english_weekly_reviews_updated_at on public.english_weekly_reviews;
create trigger trg_english_weekly_reviews_updated_at
before update on public.english_weekly_reviews
for each row
execute function public.set_updated_at();

alter table public.english_journal_entries enable row level security;
alter table public.english_writing_issues enable row level security;
alter table public.english_reading_books enable row level security;
alter table public.english_listening_sources enable row level security;
alter table public.english_listening_sessions enable row level security;
alter table public.english_word_lookups enable row level security;
alter table public.english_vocabulary_items enable row level security;
alter table public.english_vocabulary_reviews enable row level security;
alter table public.english_speaking_sessions enable row level security;
alter table public.english_interview_questions enable row level security;
alter table public.english_interview_practice enable row level security;
alter table public.english_star_stories enable row level security;
alter table public.english_weekly_reviews enable row level security;

do $$
declare
    table_name text;
begin
    foreach table_name in array array[
        'english_journal_entries',
        'english_writing_issues',
        'english_reading_books',
        'english_listening_sources',
        'english_listening_sessions',
        'english_word_lookups',
        'english_vocabulary_items',
        'english_vocabulary_reviews',
        'english_speaking_sessions',
        'english_interview_questions',
        'english_interview_practice',
        'english_star_stories',
        'english_weekly_reviews'
    ]
    loop
        if not exists (
            select 1
            from pg_policies
            where schemaname = 'public'
              and tablename = table_name
              and policyname = 'Allow all on ' || table_name
        ) then
            execute format(
                'create policy %I on public.%I for all using (true) with check (true)',
                'Allow all on ' || table_name,
                table_name
            );
        end if;
    end loop;
end $$;
