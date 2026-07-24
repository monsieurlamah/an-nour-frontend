import i18n from "@/lib/i18n";

// Thin fetch wrapper around the AN-NOUR FastAPI backend.
// - Injects the Bearer access token on authenticated requests.
// - Transparently refreshes the access token once on a 401, then retries.
// - Normalises backend errors into a typed `ApiError`.

const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8001").replace(/\/$/, "");
const API_PREFIX = "/api/v1";

const ACCESS_KEY = "eboutique.access_token";
const REFRESH_KEY = "eboutique.refresh_token";

// ───────────────── Token storage (SSR-safe) ─────────────────
export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(ACCESS_KEY);
  } catch {
    return null;
  }
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

export function setTokens(access: string, refresh: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  } catch {
    /* ignore */
  }
}

export function clearTokens() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  } catch {
    /* ignore */
  }
}

// ───────────────── Errors ─────────────────
export class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

function extractDetail(data: unknown, fallback: string): string {
  if (typeof data === "string" && data) return data;
  if (data && typeof data === "object" && "detail" in data) {
    const d = (data as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d.length > 0) {
      const first = d[0] as { msg?: string };
      if (first?.msg) return first.msg;
    }
  }
  return fallback;
}

type RequestOptions = {
  method?: string;
  /** JSON body (object) — mutually exclusive with `form`. */
  body?: unknown;
  /** URL-encoded form body (OAuth2 login). */
  form?: Record<string, string>;
  /** Attach the Bearer access token (default true). */
  auth?: boolean;
  /** Internal: prevents infinite refresh recursion. */
  _retried?: boolean;
};

async function rawRequest(path: string, options: RequestOptions): Promise<Response> {
  const { method = "GET", body, form, auth = true } = options;
  const headers: Record<string, string> = {};
  let payload: BodyInit | undefined;

  if (form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    payload = new URLSearchParams(form).toString();
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  if (auth) {
    const token = getAccessToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  headers["Accept-Language"] = i18n.language || "fr";

  return fetch(`${API_URL}${API_PREFIX}${path}`, { method, headers, body: payload });
}

async function tryRefresh(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  try {
    const res = await rawRequest("/auth/refresh", {
      method: "POST",
      body: { refresh_token: refresh },
      auth: false,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { access_token: string; refresh_token: string };
    setTokens(data.access_token, data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  let res: Response;
  try {
    res = await rawRequest(path, options);
  } catch (e) {
    if (e instanceof TypeError) {
      throw new ApiError(0, "Impossible de contacter le serveur. Vérifiez que l'API est démarrée.");
    }
    throw e;
  }

  // Attempt a single transparent refresh on expired access tokens.
  if (res.status === 401 && options.auth !== false && !options._retried) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return apiRequest<T>(path, { ...options, _retried: true });
    }
    clearTokens();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }

  if (res.status === 204) return undefined as T;

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, extractDetail(data, `Erreur ${res.status}`));
  }
  return data as T;
}

/** Upload a file as multipart/form-data. Progress via XHR so we can track percentage. */
export function uploadFile<T = unknown>(
  path: string,
  file: File,
  fieldName = "file",
  onProgress?: (pct: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${API_URL}${API_PREFIX}${path}`;

    xhr.open("POST", url, true);

    const token = getAccessToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }

    xhr.onload = () => {
      let data: unknown = null;
      try { data = JSON.parse(xhr.responseText); } catch { data = xhr.responseText; }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as T);
      } else {
        reject(new ApiError(xhr.status, extractDetail(data, `Erreur ${xhr.status}`)));
      }
    };

    xhr.onerror = () => reject(new ApiError(0, "Erreur réseau"));

    const form = new FormData();
    form.append(fieldName, file);
    xhr.send(form);
  });
}
