#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { isSlug, siteConfig } from '@soy1limon/core';
import { closeExiftool } from './exiftool.ts';
import { inspectImage, processImage } from './pipeline.ts';
import { createLocalFsStorage } from './storage/local-fs.ts';

const USAGE = `Usage: pnpm media process <file> [options]

Runs the full image pipeline locally and writes the results to a folder (nothing is uploaded).

Options:
  --out <dir>         Output folder (default: ./media-out)
  --seo-name <name>   File name base, e.g. "sunset-over-monterrey" (default: suggested from the file)
  --alt <text>        Alt text to embed
  --no-watermark      Skip the watermark
  --keep-location     Keep GPS data (removed by default)
  -h, --help          Show this help
`;

// `pnpm media` runs from the repo root; INIT_CWD is where the user actually typed the command.
const userCwd = process.env.INIT_CWD ?? process.cwd();

export async function run(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      out: { type: 'string', default: 'media-out' },
      'seo-name': { type: 'string' },
      alt: { type: 'string' },
      'no-watermark': { type: 'boolean', default: false },
      'keep-location': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  const [command, file] = positionals;
  if (values.help || command !== 'process' || !file) {
    process.stdout.write(USAGE);
    return values.help ? 0 : 1;
  }

  const path = resolve(userCwd, file);
  const outDir = resolve(userCwd, values.out);
  const buffer = await readFile(path);
  const input = { buffer, filename: basename(path) };

  const inspected = await inspectImage(input);
  const seoName = values['seo-name'] ?? inspected.suggestion.seoName;
  if (!isSlug(seoName))
    throw new Error(`--seo-name must be lowercase words separated by hyphens, got "${seoName}"`);

  const metadata = { ...inspected.suggestion.metadata };
  if (values['keep-location'] && inspected.file.metadata.location) {
    metadata.location = inspected.file.metadata.location;
  }

  const storage = createLocalFsStorage({
    root: outDir,
    publicBaseUrl: pathToFileURL(`${outDir}/public`).href,
  });
  const result = await processImage(
    input,
    {
      id: crypto.randomUUID(),
      seoName,
      metadata,
      altText: values.alt ?? inspected.suggestion.altText,
      watermark: !values['no-watermark'] && siteConfig.watermark.enabledByDefault,
    },
    storage,
  );

  const summary = {
    input: {
      file: path,
      type: inspected.mime,
      bytes: inspected.bytes,
      width: inspected.width,
      height: inspected.height,
    },
    gpsInFile: Boolean(inspected.file.metadata.location),
    gpsInOutput: Boolean(metadata.location),
    embeddedMetadata: metadata,
    dominantColor: result.dominantColor,
    original: `${outDir}/private/${result.original.key}`,
    variants: result.variants.map((variant) => ({
      width: variant.w,
      height: variant.h,
      kb: Math.round((variant.bytes / 1024) * 10) / 10,
      file: `${outDir}/public/${variant.key}`,
    })),
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => closeExiftool());
}
