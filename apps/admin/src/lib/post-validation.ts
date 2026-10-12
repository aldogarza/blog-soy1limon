import type { LocalizedText } from '@soy1limon/core';
import { DESCRIPTION_RECOMMENDED, type PostFormValues, TITLE_RECOMMENDED } from './post-form.ts';

export interface PublishCheck {
  /** Block publishing. */
  errors: string[];
  /** Shown to the author but do not block (e.g. a long meta description). */
  warnings: string[];
}

interface ImageInfo {
  seoName: string;
  alt: LocalizedText;
}

const LANGUAGE_NAME = { en: 'English', es: 'Spanish' } as const;

/**
 * Everything a post needs before it may go public. `bodyProblems` comes from rendering the body
 * (unknown images, missing alt text, removed HTML).
 */
export function checkPublishable(
  values: PostFormValues,
  bodyProblems: readonly string[],
  images: ReadonlyMap<string, ImageInfo>,
): PublishCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const language = LANGUAGE_NAME[values.lang];

  if (!values.title) errors.push('Add a title.');
  else if (values.title.length > TITLE_RECOMMENDED) {
    warnings.push(
      `The title is longer than ${TITLE_RECOMMENDED} characters; search results may cut it.`,
    );
  }

  if (!values.description)
    errors.push('Add a description (it is shown in search results and link previews).');
  else if (values.description.length > DESCRIPTION_RECOMMENDED) {
    warnings.push(
      `The description is longer than ${DESCRIPTION_RECOMMENDED} characters; search results may cut it.`,
    );
  }

  if (!values.bodyMd.trim()) errors.push('Write the post body.');

  for (const problem of bodyProblems) {
    if (problem.startsWith('Raw HTML')) warnings.push(problem);
    else errors.push(problem);
  }

  const checkImage = (id: string, role: string) => {
    const image = images.get(id);
    if (!image) {
      errors.push(`The ${role} image no longer exists or is not ready.`);
    } else if (!image.alt[values.lang]) {
      errors.push(`The ${role} image “${image.seoName}” needs alt text in ${language}.`);
    }
  };
  if (values.coverImageId) checkImage(values.coverImageId, 'cover');
  for (const id of values.galleryImageIds) checkImage(id, 'gallery');

  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}
