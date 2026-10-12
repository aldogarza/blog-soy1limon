import { ExifTool } from 'exiftool-vendored';

let instance: ExifTool | undefined;

/** One long-lived exiftool process per Node process; starting Perl for every call would be slow. */
export function getExiftool(): ExifTool {
  instance ??= new ExifTool();
  return instance;
}

/** Must be called before a CLI or test run exits, otherwise the child process keeps Node alive. */
export async function closeExiftool(): Promise<void> {
  if (!instance) return;
  const current = instance;
  instance = undefined;
  await current.end();
}
