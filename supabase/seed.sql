-- Local development data. Applied by `supabase db reset` on the LOCAL stack only;
-- `supabase db push` never runs this file against the real project.

insert into public.tags (id, slug, labels) values
  ('00000000-0000-4000-8000-000000000101', 'photography', '{"en": "Photography", "es": "Fotografía"}'),
  ('00000000-0000-4000-8000-000000000102', 'travel', '{"en": "Travel", "es": "Viajes"}'),
  ('00000000-0000-4000-8000-000000000103', 'notes', '{"en": "Notes", "es": "Notas"}');

insert into public.posts
  (id, lang, slug, title, description, body_md, status, published_at, translation_key)
values
  (
    '00000000-0000-4000-8000-000000000001', 'en', 'hello-world',
    'Hello, world',
    'The first post of this blog: what it is about and how it is built.',
    E'This blog is written in English and Spanish.\n\n## Why\n\nTo share photos and notes.',
    'published', now() - interval '2 days',
    '00000000-0000-4000-8000-0000000000a1'
  ),
  (
    '00000000-0000-4000-8000-000000000002', 'es', 'hola-mundo',
    'Hola, mundo',
    'La primera entrada de este blog: de qué trata y cómo está hecho.',
    E'Este blog está escrito en inglés y español.\n\n## Por qué\n\nPara compartir fotos y notas.',
    'published', now() - interval '2 days',
    '00000000-0000-4000-8000-0000000000a1'
  ),
  (
    '00000000-0000-4000-8000-000000000003', 'es', 'borrador-de-viaje',
    'Borrador de viaje',
    '',
    'Notas sin terminar.',
    'draft', null, null
  ),
  (
    '00000000-0000-4000-8000-000000000004', 'en', 'scheduled-post',
    'A scheduled post',
    'This post becomes public automatically next month.',
    'Coming soon.',
    'published', now() + interval '30 days', null
  );

insert into public.post_tags (post_id, tag_id) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000103'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000103'),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000102');
