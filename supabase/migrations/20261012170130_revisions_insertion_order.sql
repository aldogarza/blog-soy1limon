-- Order revisions by insertion, not by timestamp.
-- Two saves in the same clock tick get equal created_at values, which made "newest 50" ambiguous:
-- pruning could drop a recent revision and keep an older one. An identity column is strictly increasing.

alter table public.revisions add column seq bigint generated always as identity;

drop index public.revisions_entity_idx;
create index revisions_entity_seq_idx on public.revisions (entity_type, entity_id, seq desc);

create or replace function public.prune_revisions()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.revisions r
  where r.entity_type = new.entity_type
    and r.entity_id = new.entity_id
    and r.seq <= (
      select min(newest.seq) from (
        select seq from public.revisions
        where entity_type = new.entity_type and entity_id = new.entity_id
        order by seq desc
        limit 50
      ) as newest
    ) - 1;
  return null;
end;
$$;
