import sharp from "sharp";

/**
 * Compress a base64 data URL (or raw base64) image into a small JPEG buffer.
 * Resizes to a max dimension and strips metadata to keep files lean.
 */
export async function compressImage(
  dataUrl: string,
  opts: { maxSize?: number; quality?: number } = {}
): Promise<{ data: Buffer; contentType: string; size: number }> {
  const { maxSize = 1280, quality = 68 } = opts;

  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  const input = Buffer.from(base64, "base64");

  const data = await sharp(input)
    .rotate() // honour EXIF orientation before stripping metadata
    .resize(maxSize, maxSize, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();

  return { data, contentType: "image/jpeg", size: data.length };
}

/** Compress a signature PNG (keep transparency, small footprint). */
export async function compressSignature(
  dataUrl: string
): Promise<{ data: Buffer; contentType: string; size: number }> {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  const input = Buffer.from(base64, "base64");

  const data = await sharp(input)
    .resize(900, 400, { fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();

  return { data, contentType: "image/png", size: data.length };
}
