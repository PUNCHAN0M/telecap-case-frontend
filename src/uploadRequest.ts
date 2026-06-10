export function putObjectWithProgress(
  url: string,
  blob: Blob,
  contentType: string,
  onProgress: (progress: number) => void,
  signal: AbortSignal,
): Promise<{ eTag: string }> {
  return new Promise((resolve, reject) => {

    const cleanUrl = cleanPresignedUrl(url);

    const xhr = new XMLHttpRequest();
    xhr.timeout = 120_000; // 2 minutes

    const abort = () => {
      xhr.abort();
      reject(new DOMException('Upload cancelled', 'AbortError'));
    };

    if (signal.aborted) {
      abort();
      return;
    }

    signal.addEventListener('abort', abort, { once: true });

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress((event.loaded / event.total) * 100);
      }
    };

    xhr.onload = () => {
      signal.removeEventListener('abort', abort);
      if (xhr.status >= 200 && xhr.status < 300) {
        const eTag = xhr.getResponseHeader('ETag');
        if (!eTag) {
          reject(new Error('MinIO PUT succeeded but ETag header is missing. Check CORS exposed headers.'));
          return;
        }
        resolve({ eTag });
        return;
      }
      reject(new Error(`MinIO PUT failed: HTTP ${xhr.status} ${xhr.statusText}. Response: ${xhr.responseText || '(empty)'}`));
    };

    xhr.onerror = () => {
      signal.removeEventListener('abort', abort);
      reject(new Error('MinIO PUT failed: Network error (CORS blocked or server unreachable)'));
    };

    xhr.ontimeout = () => {
      signal.removeEventListener('abort', abort);
      reject(new Error('MinIO PUT failed: Request timeout (120s)'));
    };

    xhr.open('PUT', cleanUrl);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.send(blob);
  });
}

function cleanPresignedUrl(url: string): string {
  const u = new URL(url);
  u.searchParams.delete('x-amz-checksum-crc32');
  u.searchParams.delete('x-amz-sdk-checksum-algorithm');
  return u.toString();
}