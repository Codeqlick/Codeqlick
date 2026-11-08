/** Longest side the browser sends, in pixels (the API keeps at most 1600). */
export const UPLOAD_SIDE = 1600;
/** Under the web server's 1 MB request limit, with room for the form fields. */
export const UPLOAD_BYTES = 900_000;

/** The largest size that fits `maxSide`, keeping the proportions. */
export function fitWithin(width: number, height: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/**
 * Shrinks a photo in the browser before it is sent: turned the right way up, at most UPLOAD_SIDE,
 * as a JPEG under UPLOAD_BYTES. Drawing it on a canvas also leaves the camera's metadata (EXIF,
 * location) behind; the API re-encodes it again anyway.
 */
export async function compressPhoto(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    let side = UPLOAD_SIDE;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const size = fitWithin(bitmap.width, bitmap.height, side);
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No canvas');
      context.drawImage(bitmap, 0, 0, size.width, size.height);
      for (const quality of [0.86, 0.76, 0.66]) {
        const blob = await toBlob(canvas, quality);
        if (blob && blob.size <= UPLOAD_BYTES) {
          return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
        }
      }
      side = Math.round(side * 0.8);
    }
    throw new Error('Too big');
  } finally {
    bitmap.close();
  }
}
