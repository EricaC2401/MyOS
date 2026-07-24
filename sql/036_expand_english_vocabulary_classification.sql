alter table public.english_word_lookups
    add column if not exists item_type text,
    add column if not exists learning_classification text,
    add column if not exists familiarity_status text,
    add column if not exists pronunciation_note text,
    add column if not exists is_promoted boolean not null default false,
    add column if not exists promoted_at timestamptz;

update public.english_word_lookups
set item_type = 'PHRASE'
where item_type is null
  and phrase ~ '\s';

update public.english_word_lookups
set item_type = 'WORD'
where item_type is null;

update public.english_word_lookups
set learning_classification = 'C_ACTIVELY_LEARN'
where learning_classification is null
  and status = 'active';

update public.english_word_lookups
set learning_classification = 'A_UNDERSTAND_FOR_NOW'
where learning_classification is null;

update public.english_word_lookups
set familiarity_status = 'NEW'
where familiarity_status is null;

update public.english_word_lookups
set status = 'promoted',
    is_promoted = true,
    promoted_at = coalesce(promoted_at, updated_at)
where status = 'active'
  and (is_promoted = false or promoted_at is null);

alter table public.english_word_lookups
    alter column item_type set not null,
    alter column learning_classification set not null,
    alter column familiarity_status set not null,
    drop constraint if exists english_word_lookups_status_check,
    add constraint english_word_lookups_item_type_check check (item_type in ('WORD', 'PHRASE')),
    add constraint english_word_lookups_learning_classification_check check (
        learning_classification in ('A_UNDERSTAND_FOR_NOW', 'B_RECOGNISE', 'C_ACTIVELY_LEARN')
    ),
    add constraint english_word_lookups_familiarity_status_check check (
        familiarity_status in ('NEW', 'FAMILIAR_BUT_FORGOTTEN', 'REFRESHED', 'CONFIDENT')
    ),
    add constraint english_word_lookups_status_check check (status in ('inbox', 'promoted', 'archived'));

alter table public.english_vocabulary_items
    add column if not exists item_type text,
    add column if not exists learning_classification text,
    add column if not exists familiarity_status text,
    add column if not exists source_context text,
    add column if not exists personal_sentence text,
    add column if not exists category text,
    add column if not exists pronunciation_note text,
    add column if not exists promoted_at timestamptz;

update public.english_vocabulary_items vocab
set item_type = coalesce(vocab.item_type, lookup.item_type),
    learning_classification = coalesce(vocab.learning_classification, lookup.learning_classification),
    familiarity_status = coalesce(vocab.familiarity_status, lookup.familiarity_status),
    source_context = coalesce(vocab.source_context, lookup.source_context),
    pronunciation_note = coalesce(vocab.pronunciation_note, lookup.pronunciation_note),
    promoted_at = coalesce(vocab.promoted_at, vocab.created_at)
from public.english_word_lookups lookup
where vocab.lookup_id = lookup.id;

update public.english_vocabulary_items
set item_type = 'PHRASE'
where item_type is null
  and phrase ~ '\s';

update public.english_vocabulary_items
set item_type = 'WORD'
where item_type is null;

update public.english_vocabulary_items
set learning_classification = 'C_ACTIVELY_LEARN'
where learning_classification is null;

update public.english_vocabulary_items
set familiarity_status = 'NEW'
where familiarity_status is null;

update public.english_vocabulary_items
set personal_sentence = example_sentence
where personal_sentence is null
  and example_sentence is not null;

update public.english_vocabulary_items
set personal_sentence = phrase
where personal_sentence is null;

update public.english_vocabulary_items
set promoted_at = created_at
where promoted_at is null;

alter table public.english_vocabulary_items
    alter column item_type set not null,
    alter column learning_classification set not null,
    alter column familiarity_status set not null,
    alter column personal_sentence set not null,
    drop constraint if exists english_vocabulary_items_item_type_check,
    drop constraint if exists english_vocabulary_items_learning_classification_check,
    drop constraint if exists english_vocabulary_items_familiarity_status_check,
    add constraint english_vocabulary_items_item_type_check check (item_type in ('WORD', 'PHRASE')),
    add constraint english_vocabulary_items_learning_classification_check check (
        learning_classification in ('A_UNDERSTAND_FOR_NOW', 'B_RECOGNISE', 'C_ACTIVELY_LEARN')
    ),
    add constraint english_vocabulary_items_familiarity_status_check check (
        familiarity_status in ('NEW', 'FAMILIAR_BUT_FORGOTTEN', 'REFRESHED', 'CONFIDENT')
    );

create index if not exists idx_english_word_lookups_learning_classification
    on public.english_word_lookups (learning_classification, item_type, updated_at desc);

create index if not exists idx_english_word_lookups_promoted
    on public.english_word_lookups (is_promoted, promoted_at desc);

create index if not exists idx_english_vocabulary_items_promoted
    on public.english_vocabulary_items (promoted_at desc, next_review_date asc);
