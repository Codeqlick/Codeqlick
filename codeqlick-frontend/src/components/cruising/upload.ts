/** Browser-side upload to the BFF route, with progress (fetch has no upload progress). */

export type UploadOutcome = { status: number };

function send(
  url: string,
  form: FormData,
  onProgress: (fraction: number) => void,
): Promise<UploadOutcome> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.open('POST', url);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
    request.onload = () => resolve({ status: request.status });
    request.onerror = () => resolve({ status: 0 });
    request.ontimeout = () => resolve({ status: 0 });
    request.send(form);
  });
}

/**
 * Sends the form and reports progress. This route isn't behind the proxy that refreshes an old
 * session, so a 401 asks the page itself once (that does refresh it) and tries again.
 */
export async function uploadWithProgress(
  url: string,
  form: FormData,
  onProgress: (fraction: number) => void,
): Promise<UploadOutcome> {
  const first = await send(url, form, onProgress);
  if (first.status !== 401) return first;
  try {
    await fetch(window.location.href, { cache: 'no-store', credentials: 'same-origin' });
  } catch {
    return first;
  }
  return send(url, form, onProgress);
}

/** A video's length in seconds, read by the browser; null when it can't say within 5 seconds. */
export function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    const done = (value: number | null) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      resolve(value);
    };
    const timer = setTimeout(() => done(null), 5000);
    video.preload = 'metadata';
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}
