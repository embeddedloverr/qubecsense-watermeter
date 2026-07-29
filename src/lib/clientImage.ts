/**
 * Browser-side image downscaling. Shared by the installation PhotoInput and
 * the chat composer so there is one implementation rather than two that drift.
 *
 * The server compresses again — this pass exists to keep the upload small
 * enough to post as a data URL over a phone connection.
 */

/** Downscale + compress an image File to a JPEG data URL. */
export function compressFile(
  file: File,
  maxSize: number,
  quality: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas unsupported"));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Compress until the data URL fits `maxBytes`, stepping the quality down and
 * then the dimensions. A single fixed pass is not enough here: a modern phone
 * camera photo can still exceed the request limit at quality 0.7, and the
 * failure would surface as an opaque network error mid-conversation.
 */
export async function compressToFit(
  file: File,
  opts: { maxSize?: number; quality?: number; maxBytes?: number } = {}
): Promise<string> {
  const { maxSize = 1600, quality = 0.75, maxBytes = 1_400_000 } = opts;

  let out = await compressFile(file, maxSize, quality);
  const attempts: [number, number][] = [
    [maxSize, 0.6],
    [1280, 0.55],
    [1024, 0.5],
    [800, 0.45],
  ];
  for (const [size, q] of attempts) {
    if (out.length <= maxBytes) break;
    out = await compressFile(file, size, q);
  }
  return out;
}
