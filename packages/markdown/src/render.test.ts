import { describe, expect, it } from 'vitest';
import { extractImageIds, type ImageForRender, renderMarkdown } from './render.ts';

const ID = '11111111-1111-4111-8111-111111111111';
const NO_ALT_ID = '22222222-2222-4222-8222-222222222222';

const images = new Map<string, ImageForRender>([
  [
    ID,
    {
      id: ID,
      seoName: 'sunset',
      width: 2000,
      height: 1333,
      variants: [
        { w: 400, h: 267, bytes: 1, key: 'images/2026/sunset-a-400.webp' },
        { w: 800, h: 533, bytes: 1, key: 'images/2026/sunset-b-800.webp' },
        { w: 2000, h: 1333, bytes: 1, key: 'images/2026/sunset-c-2000.webp' },
      ],
      alt: { en: 'Orange sky over the hills', es: 'Cielo naranja sobre los cerros' },
      caption: { es: 'Monterrey al atardecer' },
    },
  ],
  [
    NO_ALT_ID,
    {
      id: NO_ALT_ID,
      seoName: 'no-alt',
      width: 400,
      height: 300,
      variants: [{ w: 400, h: 300, bytes: 1, key: 'images/2026/no-alt-d-400.webp' }],
      alt: {},
      caption: {},
    },
  ],
]);

const base = { images, mediaBaseUrl: 'https://img.example.com' } as const;

describe('renderMarkdown', () => {
  it('turns a standalone image into a responsive figure with alt and caption in the post language', async () => {
    const result = await renderMarkdown(`![](image:${ID})`, { ...base, lang: 'es' });
    expect(result.problems).toEqual([]);
    expect(result.html).toContain('<figure>');
    expect(result.html).toContain('alt="Cielo naranja sobre los cerros"');
    expect(result.html).toContain('<figcaption>Monterrey al atardecer</figcaption>');
    expect(result.html).toContain('src="https://img.example.com/images/2026/sunset-b-800.webp"');
    expect(result.html).toContain(
      'srcset="https://img.example.com/images/2026/sunset-a-400.webp 400w, https://img.example.com/images/2026/sunset-b-800.webp 800w, https://img.example.com/images/2026/sunset-c-2000.webp 2000w"',
    );
    expect(result.html).toMatch(/width="2000" height="1333" loading="lazy" decoding="async"/);
    expect(result.imageIds).toEqual([ID]);
  });

  it('prefers alt text written in the Markdown and keeps inline images inline', async () => {
    const result = await renderMarkdown(`Look ![a custom alt](image:${ID}) here.`, {
      ...base,
      lang: 'en',
    });
    expect(result.html).not.toContain('<figure>');
    expect(result.html).toContain('alt="a custom alt"');
  });

  it('reports unknown images and missing alt text instead of failing', async () => {
    const result = await renderMarkdown(
      `![](image:${NO_ALT_ID})\n\n![](image:33333333-3333-4333-8333-333333333333)`,
      { ...base, lang: 'en' },
    );
    expect(result.problems).toEqual([
      'The image “no-alt” has no alt text in English.',
      'The image 33333333-3333-4333-8333-333333333333 does not exist or is not ready.',
    ]);
    expect(result.html).toContain('[missing image]');
  });

  it('demotes headings so the post title stays the only h1, with ids for anchors', async () => {
    const result = await renderMarkdown('# Intro\n\n## Details\n\nText', { ...base, lang: 'en' });
    expect(result.html).toContain('<h2 id="intro">Intro</h2>');
    expect(result.html).toContain('<h3 id="details">Details</h3>');
    expect(result.headings).toEqual([
      { depth: 2, id: 'intro', text: 'Intro' },
      { depth: 3, id: 'details', text: 'Details' },
    ]);
  });

  it('leaves headings alone when they already start at h2', async () => {
    const result = await renderMarkdown('## Already fine', { ...base, lang: 'en' });
    expect(result.html).toContain('<h2 id="already-fine">');
  });

  it('removes raw HTML, scripts and javascript: links', async () => {
    const result = await renderMarkdown(
      '<script>alert(1)</script>\n\n<iframe src="https://evil.example"></iframe>\n\n[click](javascript:alert(1)) <img src=x onerror=alert(1)>',
      { ...base, lang: 'en' },
    );
    expect(result.html).not.toMatch(/<script|<iframe|onerror|javascript:/);
    expect(result.problems).toContain(
      'Raw HTML is not allowed in posts and was removed. Use Markdown instead.',
    );
  });

  it('supports GitHub-flavoured Markdown (tables, task lists, strikethrough)', async () => {
    const result = await renderMarkdown(
      '| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n\n~~old~~',
      {
        ...base,
        lang: 'en',
      },
    );
    expect(result.html).toContain('<table>');
    expect(result.html).toContain('type="checkbox"');
    expect(result.html).toContain('<del>old</del>');
  });

  it('highlights fenced code and falls back to plain text for unknown languages', async () => {
    const result = await renderMarkdown('```ts\nconst a: number = 1;\n```\n\n```nope\nplain\n```', {
      ...base,
      lang: 'en',
    });
    expect(result.html).toContain('class="shiki shiki-themes github-light github-dark"');
    expect(result.html).toContain('plain');
    expect(result.problems).toEqual([]);
  });

  it('estimates reading time at 200 words per minute', async () => {
    const result = await renderMarkdown('word '.repeat(450), { ...base, lang: 'en' });
    expect(result.readingMinutes).toBe(3);
  });
});

describe('extractImageIds', () => {
  it('lists each referenced image once, in order', () => {
    expect(
      extractImageIds(
        `![a](image:${NO_ALT_ID}) ![b](image:${ID})\n\n![c](image:${NO_ALT_ID}) ![d](https://x.example/y.png)`,
      ),
    ).toEqual([NO_ALT_ID, ID]);
  });
});
