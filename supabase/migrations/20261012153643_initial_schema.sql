-- Initial schema for blog-soy1limon.
-- Security model:
--   * The local admin uses the secret key (service_role), which bypasses RLS.
--   * The public build uses the publishable key (anon role) and can only SELECT published content.
--   * The authenticated role gets nothing: the project has no users and sign-ups are disabled.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Images
-- ---------------------------------------------------------------------------

create table public.images (
  id uuid primary key default gen_random_uuid(),
  -- Base of the public file names, e.g. "sunset-over-monterrey".
  seo_name text not null unique
    check (seo_name ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(seo_name) <= 80),
  status text not null default 'processing'
    check (status in ('processing', 'ready', 'failed')),
  -- Object key of the untouched original in the private "originals" bucket.
  original_key text not null unique,
  original_filename text not null,
  original_mime text not null,
  original_bytes bigint not null check (original_bytes > 0),
  width integer check (width > 0),
  height integer check (height > 0),
  dominant_color text check (dominant_color ~ '^#[0-9a-f]{6}$'),
  -- [{ "w": 800, "h": 533, "bytes": 51234, "key": "images/2026/name-1a2b3c4d-800.webp" }]
  variants jsonb not null default '[]'::jsonb check (jsonb_typeof(variants) = 'array'),
  -- The edited metadata set embedded into every public variant.
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  -- Per-language text: { "en": "...", "es": "..." }
  alt jsonb not null default '{}'::jsonb check (jsonb_typeof(alt) = 'object'),
  caption jsonb not null default '{}'::jsonb check (jsonb_typeof(caption) = 'object'),
  watermark boolean not null default true,
  -- Public keys replaced by a rename; kept until a manual clean-up so old links keep working.
  retired_keys text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint images_ready_is_complete check (
    status <> 'ready'
    or (width is not null and height is not null and jsonb_array_length(variants) > 0)
  )
);

comment on table public.images is 'Uploaded photos. Public variants live in R2; originals in a private bucket.';

create trigger images_set_updated_at
before update on public.images
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Posts
-- ---------------------------------------------------------------------------

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  lang text not null check (lang in ('en', 'es')),
  slug text not null
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title text not null default '' check (char_length(title) <= 200),
  -- Meta description. The editor recommends <= 160 characters; this is only a hard ceiling.
  description text not null default '' check (char_length(description) <= 300),
  body_md text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  -- A published post with a future date is "scheduled": hidden until that moment.
  published_at timestamptz,
  -- Restrict: an image cannot be deleted while a post uses it.
  cover_image_id uuid references public.images (id) on delete restrict,
  -- Posts sharing a key are translations of each other (used for hreflang).
  translation_key uuid,
  -- Old slugs that must keep redirecting to the current URL.
  previous_slugs text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posts_lang_slug_key unique (lang, slug),
  constraint posts_published_has_date check (status <> 'published' or published_at is not null),
  constraint posts_published_is_complete check (
    status <> 'published' or (char_length(title) > 0 and char_length(description) > 0)
  )
);

comment on table public.posts is 'Blog posts, one row per language version.';

-- At most one post per language inside a translation group.
create unique index posts_translation_key_lang_key
  on public.posts (translation_key, lang)
  where translation_key is not null;

create index posts_published_idx on public.posts (published_at desc) where status = 'published';
create index posts_cover_image_id_idx on public.posts (cover_image_id);

create trigger posts_set_updated_at
before update on public.posts
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Tags
-- ---------------------------------------------------------------------------

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  -- { "en": "Travel", "es": "Viajes" }
  labels jsonb not null default '{}'::jsonb check (jsonb_typeof(labels) = 'object'),
  created_at timestamptz not null default now()
);

create table public.post_tags (
  post_id uuid not null references public.posts (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (post_id, tag_id)
);

create index post_tags_tag_id_idx on public.post_tags (tag_id);

-- ---------------------------------------------------------------------------
-- Post images (gallery and inline references; the cover lives on posts)
-- ---------------------------------------------------------------------------

create table public.post_images (
  post_id uuid not null references public.posts (id) on delete cascade,
  image_id uuid not null references public.images (id) on delete restrict,
  -- "inline" rows are derived from image references inside body_md.
  role text not null check (role in ('gallery', 'inline')),
  position integer not null default 0 check (position >= 0),
  primary key (post_id, image_id, role)
);

create index post_images_image_id_idx on public.post_images (image_id);

-- ---------------------------------------------------------------------------
-- Revisions (history of posts and image metadata)
-- ---------------------------------------------------------------------------

create table public.revisions (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('post', 'image')),
  entity_id uuid not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now()
);

create index revisions_entity_idx on public.revisions (entity_type, entity_id, created_at desc);

-- Keeps only the newest 50 revisions per entity so the free database tier never fills up.
create function public.prune_revisions()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.revisions r
  where r.entity_type = new.entity_type
    and r.entity_id = new.entity_id
    and r.id not in (
      select id from public.revisions
      where entity_type = new.entity_type and entity_id = new.entity_id
      order by created_at desc, id desc
      limit 50
    );
  return null;
end;
$$;

create trigger revisions_prune
after insert on public.revisions
for each row execute function public.prune_revisions();

-- ---------------------------------------------------------------------------
-- Transactional helpers for the admin (PostgREST cannot run multi-statement transactions)
-- ---------------------------------------------------------------------------

create function public.set_post_tags(p_post_id uuid, p_tag_ids uuid[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.post_tags where post_id = p_post_id;
  insert into public.post_tags (post_id, tag_id)
  select p_post_id, t.tag_id
  from unnest(coalesce(p_tag_ids, '{}')) as t(tag_id)
  on conflict do nothing;
end;
$$;

-- Replaces gallery and inline image references of a post. Array order becomes the position.
create function public.sync_post_images(p_post_id uuid, p_gallery uuid[], p_inline uuid[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.post_images where post_id = p_post_id;

  insert into public.post_images (post_id, image_id, role, position)
  select p_post_id, g.image_id, 'gallery', (g.ord - 1)::integer
  from unnest(coalesce(p_gallery, '{}')) with ordinality as g(image_id, ord)
  on conflict do nothing;

  insert into public.post_images (post_id, image_id, role, position)
  select p_post_id, i.image_id, 'inline', (i.ord - 1)::integer
  from unnest(coalesce(p_inline, '{}')) with ordinality as i(image_id, ord)
  on conflict do nothing;
end;
$$;

-- Only the admin (service_role) may call these.
revoke execute on function public.set_post_tags(uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public.sync_post_images(uuid, uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.set_post_tags(uuid, uuid[]) to service_role;
grant execute on function public.sync_post_images(uuid, uuid[], uuid[]) to service_role;

-- Trigger functions are not meant to be called directly.
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.prune_revisions() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security and privileges
-- ---------------------------------------------------------------------------

alter table public.images enable row level security;
alter table public.posts enable row level security;
alter table public.tags enable row level security;
alter table public.post_tags enable row level security;
alter table public.post_images enable row level security;
alter table public.revisions enable row level security;

-- Start from zero: Supabase grants broad default privileges on new tables.
revoke all on table
  public.images, public.posts, public.tags, public.post_tags, public.post_images, public.revisions
from anon, authenticated;

grant select on table public.posts, public.tags, public.post_tags, public.post_images to anon;

-- Column-level grant: original_key, original_filename, original_mime, original_bytes,
-- status, watermark, retired_keys and created_at are never readable with the publishable key.
grant select (id, seo_name, width, height, dominant_color, variants, metadata, alt, caption, updated_at)
  on table public.images to anon;

-- revisions: no grant at all for anon/authenticated.

create policy "Public reads published posts"
  on public.posts for select to anon
  using (status = 'published' and published_at <= now());

create policy "Public reads tags"
  on public.tags for select to anon
  using (true);

create policy "Public reads tags of published posts"
  on public.post_tags for select to anon
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_tags.post_id and p.status = 'published' and p.published_at <= now()
    )
  );

create policy "Public reads image links of published posts"
  on public.post_images for select to anon
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_images.post_id and p.status = 'published' and p.published_at <= now()
    )
  );

create policy "Public reads ready images used by published posts"
  on public.images for select to anon
  using (
    status = 'ready'
    and (
      exists (
        select 1 from public.posts p
        where p.cover_image_id = images.id and p.status = 'published' and p.published_at <= now()
      )
      or exists (
        select 1 from public.post_images pi
        join public.posts p on p.id = pi.post_id
        where pi.image_id = images.id and p.status = 'published' and p.published_at <= now()
      )
    )
  );
