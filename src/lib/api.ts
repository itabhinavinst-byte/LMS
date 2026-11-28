let memoryToken: string | null = null;

export function setApiToken(token: string | null): void {
  memoryToken = token;
}

export function getApiToken(): string | null {
  return memoryToken;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: {
    method?: string;
    body?: unknown;
    formData?: FormData;
    token?: string | null;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  const tokenToUse = options.token !== undefined ? options.token : memoryToken;
  if (tokenToUse) {
    headers['Authorization'] = `Bearer ${tokenToUse}`;
  }

  let bodyPayload: BodyInit | undefined;
  if (options.formData) {
    bodyPayload = options.formData;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    bodyPayload = JSON.stringify(options.body);
  }

  const res = await fetch(endpoint, {
    method: options.method || 'GET',
    headers,
    body: bodyPayload,
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    const message =
      (data && typeof data === 'object' && 'error' in data && String((data as { error: unknown }).error)) ||
      `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }

  return data as T;
}

export async function fetchAuthorizedBlob(url: string): Promise<{ blob: Blob; contentType: string }> {
  const headers: Record<string, string> = {};
  if (memoryToken) {
    headers['Authorization'] = `Bearer ${memoryToken}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) {
    let message = `Unable to load file (${res.status})`;
    try {
      const errData = await res.json();
      if (errData?.error) message = errData.error;
    } catch {
      // ignore non-json error body
    }
    throw new ApiError(message, res.status);
  }
  const blob = await res.blob();
  return { blob, contentType: res.headers.get('content-type') || blob.type };
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
