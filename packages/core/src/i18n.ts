import { DEFAULT_LOCALE, type Locale } from './locales.ts';

/** Interface strings of the public site. Post content is never translated automatically. */
const strings = {
  en: {
    skipToContent: 'Skip to main content',
    home: 'Home',
    search: 'Search',
    latestPosts: 'Latest posts',
    morePosts: 'More posts',
    allPosts: 'All posts',
    loadMore: 'Load more posts',
    loadingPosts: 'Loading…',
    /** `{n}` is filled in by the script that loads more posts. */
    loadedPosts: '{n} more posts loaded.',
    loadedPost: '1 more post loaded.',
    allPostsLoaded: 'That is every post.',
    noPosts: 'No posts yet.',
    readingTime: (minutes: number) => `${minutes} min read`,
    publishedOn: 'Published on',
    updatedOn: 'Updated on',
    taggedWith: 'Tags',
    gallery: 'Gallery',
    openFullSize: 'Open the full-size image',
    previousPhoto: 'Previous photo',
    nextPhoto: 'Next photo',
    closePhoto: 'Close',
    /** `{n}` and `{total}` are filled in by the gallery script. */
    photoPosition: 'Photo {n} of {total}',
    readInOtherLanguage: 'Leer en español',
    otherLanguageName: 'Español',
    postsTagged: (tag: string) => `Posts tagged “${tag}”`,
    page: (n: number, total: number) => `Page ${n} of ${total}`,
    pagination: 'Pagination',
    newer: 'Newer posts',
    older: 'Older posts',
    rss: 'RSS feed',
    searchLabel: 'Search the blog',
    searchPlaceholder: 'Search…',
    searchResults: (n: number) => (n === 1 ? '1 result' : `${n} results`),
    searchAllResults: 'See all results',
    searchHint: 'Type what you are looking for in the search box at the top of the page.',
    searchNoResults: 'No results.',
    searchNeedsJs: 'Search needs JavaScript. You can browse all posts instead.',
    notFoundTitle: 'Page not found',
    notFoundBody: 'This page does not exist or has moved.',
    redirecting: 'This page has moved to',
    copyright: (year: number, author: string) => `© ${year} ${author}`,
  },
  es: {
    skipToContent: 'Saltar al contenido principal',
    home: 'Inicio',
    search: 'Buscar',
    latestPosts: 'Entradas recientes',
    morePosts: 'Más entradas',
    allPosts: 'Todas las entradas',
    loadMore: 'Cargar más entradas',
    loadingPosts: 'Cargando…',
    loadedPosts: 'Se cargaron {n} entradas más.',
    loadedPost: 'Se cargó 1 entrada más.',
    allPostsLoaded: 'Ya están todas las entradas.',
    noPosts: 'Todavía no hay entradas.',
    readingTime: (minutes: number) => `${minutes} min de lectura`,
    publishedOn: 'Publicado el',
    updatedOn: 'Actualizado el',
    taggedWith: 'Etiquetas',
    gallery: 'Galería',
    openFullSize: 'Abrir la imagen en tamaño completo',
    previousPhoto: 'Foto anterior',
    nextPhoto: 'Foto siguiente',
    closePhoto: 'Cerrar',
    photoPosition: 'Foto {n} de {total}',
    readInOtherLanguage: 'Read in English',
    otherLanguageName: 'English',
    postsTagged: (tag: string) => `Entradas con la etiqueta “${tag}”`,
    page: (n: number, total: number) => `Página ${n} de ${total}`,
    pagination: 'Paginación',
    newer: 'Entradas más nuevas',
    older: 'Entradas anteriores',
    rss: 'Canal RSS',
    searchLabel: 'Buscar en el blog',
    searchPlaceholder: 'Buscar…',
    searchResults: (n: number) => (n === 1 ? '1 resultado' : `${n} resultados`),
    searchAllResults: 'Ver todos los resultados',
    searchHint: 'Escribe lo que buscas en el buscador de la parte superior.',
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
