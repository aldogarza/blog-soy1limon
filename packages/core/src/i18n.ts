import { DEFAULT_LOCALE, type Locale } from './locales.ts';

/** Interface strings of the public site. Post content is never translated automatically. */
const strings = {
  en: {
    skipToContent: 'Skip to main content',
    mainNavigation: 'Main',
    home: 'Home',
    blog: 'Blog',
    tags: 'Tags',
    search: 'Search',
    latestPosts: 'Latest posts',
    allPosts: 'All posts',
    noPosts: 'No posts yet.',
    readingTime: (minutes: number) => `${minutes} min read`,
    publishedOn: 'Published on',
    updatedOn: 'Updated on',
    taggedWith: 'Tags',
    gallery: 'Gallery',
    openFullSize: 'Open the full-size image',
    readInOtherLanguage: 'Leer en español',
    otherLanguageName: 'Español',
    otherLanguageSwitch: 'Versión en español',
    postsTagged: (tag: string) => `Posts tagged “${tag}”`,
    postCount: (n: number): string => (n === 1 ? 'post' : 'posts'),
    page: (n: number, total: number) => `Page ${n} of ${total}`,
    pagination: 'Pagination',
    newer: 'Newer posts',
    older: 'Older posts',
    rss: 'RSS feed',
    searchLabel: 'Search the blog',
    searchButton: 'Search',
    searchResults: (n: number) => (n === 1 ? '1 result' : `${n} results`),
    searchNoResults: 'No results.',
    searchNeedsJs: 'Search needs JavaScript. You can browse all posts instead.',
    notFoundTitle: 'Page not found',
    notFoundBody: 'This page does not exist or has moved.',
    redirecting: 'This page has moved to',
    copyright: (year: number, author: string) => `© ${year} ${author}`,
  },
  es: {
    skipToContent: 'Saltar al contenido principal',
    mainNavigation: 'Principal',
    home: 'Inicio',
    blog: 'Blog',
    tags: 'Etiquetas',
    search: 'Buscar',
    latestPosts: 'Entradas recientes',
    allPosts: 'Todas las entradas',
    noPosts: 'Todavía no hay entradas.',
    readingTime: (minutes: number) => `${minutes} min de lectura`,
    publishedOn: 'Publicado el',
    updatedOn: 'Actualizado el',
    taggedWith: 'Etiquetas',
    gallery: 'Galería',
    openFullSize: 'Abrir la imagen en tamaño completo',
    readInOtherLanguage: 'Read in English',
    otherLanguageName: 'English',
    otherLanguageSwitch: 'English version',
    postsTagged: (tag: string) => `Entradas con la etiqueta “${tag}”`,
    postCount: (n: number): string => (n === 1 ? 'entrada' : 'entradas'),
    page: (n: number, total: number) => `Página ${n} de ${total}`,
    pagination: 'Paginación',
    newer: 'Entradas más nuevas',
    older: 'Entradas anteriores',
    rss: 'Canal RSS',
    searchLabel: 'Buscar en el blog',
    searchButton: 'Buscar',
    searchResults: (n: number) => (n === 1 ? '1 resultado' : `${n} resultados`),
    searchNoResults: 'Sin resultados.',
    searchNeedsJs: 'La búsqueda necesita JavaScript. Puedes ver todas las entradas.',
    notFoundTitle: 'Página no encontrada',
    notFoundBody: 'Esta página no existe o cambió de dirección.',
    redirecting: 'Esta página se movió a',
    copyright: (year: number, author: string) => `© ${year} ${author}`,
  },
} satisfies Record<Locale, Record<string, unknown>>;

export type UiStrings = (typeof strings)['en'];

export function ui(lang: Locale): UiStrings {
  return strings[lang];
}

export function otherLocale(lang: Locale): Locale {
  return lang === 'en' ? 'es' : 'en';
}

/** Path prefix of a locale: '' for the default one, '/es' for Spanish. */
export function localePrefix(lang: Locale): string {
  return lang === DEFAULT_LOCALE ? '' : `/${lang}`;
}

/** BCP 47 tag used for date formatting. */
export function dateLocale(lang: Locale): string {
  return lang === 'es' ? 'es-MX' : 'en-US';
}
