import { z } from 'zod';

const IMAGE_DATA_URL_PATTERN = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

function hasMatchingImageSignature(mimeSubtype: string, bytes: Buffer): boolean {
  if (bytes.length < 12) return false;
  if (mimeSubtype === 'jpeg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeSubtype === 'png') {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    );
  }
  if (mimeSubtype === 'webp') {
    return (
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return false;
}

/** Valida se o Data URL é PNG, JPEG ou WebP autêntico verificando os magic bytes e limite de tamanho. */
export function isValidImageDataUrl(value: string, maxLength: number): boolean {
  if (value.length > maxLength) return false;
  const match = IMAGE_DATA_URL_PATTERN.exec(value);
  if (!match) return false;
  const [, mimeSubtype, base64Body] = match;
  const headerBytes = Buffer.from(base64Body.slice(0, 24), 'base64');
  return hasMatchingImageSignature(mimeSubtype, headerBytes);
}

/** Cria schema Zod reutilizável para campos opcionais de imagem Data URL com cabeçalho binário verificado. */
export function createOptionalImageDataUrlSchema(options: { maxLength: number; message: string }) {
  return z
    .string()
    .refine((value) => isValidImageDataUrl(value, options.maxLength), {
      message: options.message,
    })
    .nullable()
    .optional();
}
