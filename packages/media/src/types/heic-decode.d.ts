// heic-decode ships no type declarations; this covers the single-image API used in decode.ts.
declare module 'heic-decode' {
  interface DecodedHeic {
    width: number;
    height: number;
    /** RGBA pixels, 4 bytes per pixel. */
    data: Uint8ClampedArray;
  }

  function decode(input: { buffer: Uint8Array | ArrayBuffer }): Promise<DecodedHeic>;
  export default decode;
}
