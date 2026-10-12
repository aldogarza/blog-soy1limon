import rehypeShiki from '@shikijs/rehype';
import {
  buildSrcset,
  CONTENT_IMAGE_SIZES,
  type ImageVariant,
  type Locale,
  type LocalizedText,
  mediaUrl,
  pickVariant,
} from '@soy1limon/core';
import type { Element, ElementContent, Root as HastRoot } from 'hast';
import { toString as hastToString } from 'hast-util-to-string';
import type { Root as MdastRoot } from 'mdast';
import { toString as mdastToString } from 'mdast-util-to-string';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import type { VFile } from 'vfile';

/** Image reference syntax inside post bodies: `![alt](image:<uuid>)`. */
export const IMAGE_PROTOCOL = 'image:';

export interface ImageForRender {
  id: string;
  seoName: string;
  width: number;
  height: number;
  variants: readonly ImageVariant[];
  alt: LocalizedText;
  caption: LocalizedText;
}

export interface RenderOptions {
  /** Language of the post: picks alt text and captions. */
  lang: Locale;
  images: ReadonlyMap<string, ImageForRender>;
  mediaBaseUrl: string;
  /**
   * Level of the highest body heading. 2 on the public post page (the title is the h1); the admin
   * preview uses 3 because it sits under its own "Preview" h2.
   */
  topHeadingLevel?: 2 | 3;
}

export interface Heading {
  depth: number;
  id: string;
  text: string;
}

export interface RenderResult {
  html: string;
  headings: Heading[];
  /** Ids of every image referenced in the body, in order of appearance. */
  imageIds: string[];
  /** Human-readable issues (unknown image, missing alt, removed HTML). Empty means publishable. */
  problems: string[];
  readingMinutes: number;
}

interface RenderData {
  options: RenderOptions;
  problems: string[];
  headings: Heading[];
}

const WORDS_PER_MINUTE = 200;

function data(file: VFile): RenderData {
  return file.data as unknown as RenderData;
}

function imageIdFromUrl(url: string): string | undefined {
  return url.startsWith(IMAGE_PROTOCOL) ? url.slice(IMAGE_PROTOCOL.length) : undefined;
}

/** Collects image references from the Markdown source without rendering (used when saving). */
export function extractImageIds(markdown: string): string[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown);
  const ids: string[] = [];
  visit(tree, 'image', (node) => {
    const id = imageIdFromUrl(node.url);
    if (id && !ids.includes(id)) ids.push(id);
  });
  return ids;
}

/** Raw HTML is never rendered (no scripts, iframes or unvetted embeds); tell the author instead of failing silently. */
function remarkReportHtml() {
  return (tree: MdastRoot, file: VFile) => {
    let found = false;
    visit(tree, 'html', () => {
      found = true;
    });
    if (found) {
      data(file).problems.push(
        'Raw HTML is not allowed in posts and was removed. Use Markdown instead.',
      );
    }
  };
}

/** The post title is the page's only h1: body headings start at h2 whatever the author typed. */
function rehypeDemoteHeadings() {
  return (tree: HastRoot, file: VFile) => {
    const top = data(file).options.topHeadingLevel ?? 2;
    let minDepth = 7;
    visit(tree, 'element', (node) => {
      const match = /^h([1-6])$/.exec(node.tagName);
      if (match) minDepth = Math.min(minDepth, Number(match[1]));
    });
    const offset = Math.max(0, top - minDepth);
    if (offset === 0) return;
    visit(tree, 'element', (node) => {
      const match = /^h([1-6])$/.exec(node.tagName);
      if (match) node.tagName = `h${Math.min(6, Number(match[1]) + offset)}`;
    });
  };
}

function rehypeCollectHeadings() {
  return (tree: HastRoot, file: VFile) => {
    visit(tree, 'element', (node) => {
      const match = /^h([2-3])$/.exec(node.tagName);
      const id = node.properties.id;
      if (match && typeof id === 'string') {
        data(file).headings.push({ depth: Number(match[1]), id, text: hastToString(node) });
      }
    });
  };
}

function responsiveImage(image: ImageForRender, alt: string, baseUrl: string): Element {
  const fallback = pickVariant(image.variants, 800);
  return {
    type: 'element',
    tagName: 'img',
    properties: {
      src: fallback ? mediaUrl(baseUrl, fallback.key) : '',
      srcSet: buildSrcset(image.variants, baseUrl),
      sizes: CONTENT_IMAGE_SIZES,
      alt,
      width: image.width,
      height: image.height,
      loading: 'lazy',
      decoding: 'async',
    },
    children: [],
  };
}

/**
 * Replaces `image:<id>` references with responsive images. An image alone in its paragraph becomes
 * a <figure> (with the caption in the post language); inline images stay inline.
 */
function rehypeImages() {
  return (tree: HastRoot, file: VFile) => {
    const { options, problems } = data(file);

    const render = (node: Element): Element | undefined => {
      const src = node.properties.src;
      const id = typeof src === 'string' ? imageIdFromUrl(src) : undefined;
      if (!id) return undefined;
      const image = options.images.get(id);
      if (!image) {
        problems.push(`The image ${id} does not exist or is not ready.`);
        return {
          type: 'element',
          tagName: 'span',
          properties: {},
          children: [{ type: 'text', value: '[missing image]' }],
        };
      }
      const written = typeof node.properties.alt === 'string' ? node.properties.alt.trim() : '';
      const alt = written || image.alt[options.lang] || '';
      if (!alt)
        problems.push(
          `The image “${image.seoName}” has no alt text in ${options.lang === 'en' ? 'English' : 'Spanish'}.`,
        );
      return responsiveImage(image, alt, options.mediaBaseUrl);
    };

    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'p' || !parent || index === undefined) return;
      const meaningful = node.children.filter(
        (child) => !(child.type === 'text' && child.value.trim() === ''),
      );
      const only = meaningful[0];
      if (meaningful.length !== 1 || only?.type !== 'element' || only.tagName !== 'img') return;
      const img = render(only);
      if (!img || img.tagName !== 'img') return;
      const src = only.properties.src;
      const id = typeof src === 'string' ? imageIdFromUrl(src) : undefined;
      const caption = id ? options.images.get(id)?.caption[options.lang] : undefined;
      const children: ElementContent[] = [img];
      if (caption) {
        children.push({
          type: 'element',
          tagName: 'figcaption',
          properties: {},
          children: [{ type: 'text', value: caption }],
        });
      }
      parent.children[index] = { type: 'element', tagName: 'figure', properties: {}, children };
      return 'skip';
    });

    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'img' || !parent || index === undefined) return;
      const replacement = render(node);
      if (replacement) parent.children[index] = replacement;
    });
  };
}

// GitHub's sanitize schema, plus our `image:` protocol for <img src> (resolved right after).
const sanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    src: [...(defaultSchema.protocols?.src ?? []), 'image'],
  },
};

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkReportHtml)
  // allowDangerousHtml stays false: raw HTML never reaches the output.
  .use(remarkRehype)
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeDemoteHeadings)
  .use(rehypeSlug)
  .use(rehypeCollectHeadings)
  .use(rehypeImages)
  .use(rehypeShiki, {
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultLanguage: 'text',
    fallbackLanguage: 'text',
    lazy: true,
  })
  .use(rehypeStringify);

/** Renders a post body. Never throws for content problems: they are returned in `problems`. */
export async function renderMarkdown(
  markdown: string,
  options: RenderOptions,
): Promise<RenderResult> {
  const renderData: RenderData = { options, problems: [], headings: [] };
  const file = await processor.process({
    value: markdown,
    data: renderData as unknown as Record<string, unknown>,
  });
  const words = mdastToString(unified().use(remarkParse).parse(markdown))
    .split(/\s+/)
    .filter(Boolean).length;
  return {
    html: String(file),
    headings: renderData.headings,
    imageIds: extractImageIds(markdown),
    problems: [...new Set(renderData.problems)],
    readingMinutes: Math.max(1, Math.ceil(words / WORDS_PER_MINUTE)),
  };
}
