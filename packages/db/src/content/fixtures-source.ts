import fixtures from '../../fixtures/published-content.json' with { type: 'json' };
import { parsePublishedContent, type PublishedContent } from './schemas.ts';

/** Offline content used for pull-request CI and local builds without credentials. */
export function loadFixtureContent(): PublishedContent {
  return parsePublishedContent(fixtures, 'packages/db/fixtures/published-content.json');
}
