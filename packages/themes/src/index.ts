import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';

/**
 * Every available theme. A theme is a folder next to this file with one stylesheet per app
 * (`site.css`, `admin.css`). Themes only style the semantic markup and the hooks listed in
 * docs/themes.md, so switching themes never changes the HTML.
 */
export const THEMES = {
  plain: {
    label: 'Plain',
    description: 'Accessible baseline with system colours. The reference for the markup contract.',
  },
  istyle: {
    label: 'iStyle',
    description: 'iOS-inspired: translucent glass bars, grouped lists and rounded cards.',
  },
} as const satisfies Record<string, { label: string; description: string }>;

export type ThemeName = keyof typeof THEMES;
export type ThemeTarget = 'site' | 'admin';

export const THEME_NAMES = Object.keys(THEMES) as ThemeName[];

export function isThemeName(value: string): value is ThemeName {
  return Object.hasOwn(THEMES, value);
}

/** The theme to build: an explicit override (the THEME variable) wins over the configured one. */
export function resolveTheme(configured: string, override?: string): ThemeName {
  const name = override?.trim() || configured;
  if (!isThemeName(name)) {
    throw new Error(`Unknown theme "${name}". Available themes: ${THEME_NAMES.join(', ')}.`);
  }
  return name;
}

/** Absolute path of a theme's stylesheet for one app. */
export function themeStylesheet(theme: ThemeName, target: ThemeTarget): string {
  return fileURLToPath(new URL(`./${theme}/${target}.css`, import.meta.url));
}

/**
 * Astro integration that adds the active theme's stylesheet to every page. Vite processes it like
 * any imported CSS, so only the chosen theme ends up in the build.
 */
export function themes(options: {
  target: ThemeTarget;
  configured: string;
  override?: string | undefined;
}): AstroIntegration {
  const theme = resolveTheme(options.configured, options.override);
  const stylesheet = themeStylesheet(theme, options.target);
  if (!existsSync(stylesheet)) {
    throw new Error(`Theme "${theme}" has no ${options.target}.css (expected ${stylesheet}).`);
  }
  return {
    name: '@soy1limon/themes',
    hooks: {
      'astro:config:setup': ({ injectScript, logger }) => {
        logger.info(`Theme: ${THEMES[theme].label}`);
        // "page-ssr" imports run in every page's frontmatter: the documented way to add global CSS.
        injectScript('page-ssr', `import ${JSON.stringify(stylesheet)};`);
      },
    },
  };
}
