alter table public.english_word_lookups
    add column if not exists meaning_cantonese text;

alter table public.english_vocabulary_items
    add column if not exists meaning_cantonese text;

update public.english_vocabulary_items vocab
set meaning_cantonese = coalesce(vocab.meaning_cantonese, lookup.meaning_cantonese)
from public.english_word_lookups lookup
where vocab.lookup_id = lookup.id
  and vocab.meaning_cantonese is null;
