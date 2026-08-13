/**
 * @busos/lumen-adapter — Lumen (光砚 / Lumen Ink) generation port.
 *
 * Lumen is an external multi-provider AI image-editing service. The application
 * layer (creative-production) depends ONLY on `LumenPort` here — it never sees
 * Lumen's HTTP paths, auth, or (critically) the underlying provider key (D018).
 *
 * Security boundary (P5 §19): AI Business OS holds at most Lumen's
 * `AUTH_PASSWORD` + base URL. The image-provider credential (Seedream /
 * Volcengine Ark) lives exclusively inside Lumen and is never read or forwarded.
 */

/** One generation request. Exactly one source image, per P5 §16. */
export interface LumenGenerateInput {
  prompt: string;
  /** Human-readable Lumen project name (derived from the creative task). */
  project_name: string;
  /** Source image bytes (base64) — Lumen requires a source image to edit. */
  source_image_base64: string;
  source_image_mime_type: string;
}

export interface LumenGenerateResult {
  status: 'GENERATED' | 'FAILED';
  /** Present when GENERATED: a (signed) URL of the output artifact. */
  asset_uri?: string;
  /** Present when GENERATED. May be null when Lumen does not advertise it. */
  mime_type?: string | null;
  /** Present when GENERATED. Lumen project id, needed for cleanup. */
  lumen_project_id?: string;
  /** Present when FAILED. Stable Lumen error code or HTTP-derived code. */
  error_code?: string;
  error_message?: string;
}

export interface LumenAdapterConfig {
  /** Deployed Lumen origin, e.g. https://lumen-ink-xxx.vercel.app (no trailing slash). */
  baseUrl: string;
  /** Lumen `AUTH_PASSWORD` (never the provider key). */
  authPassword: string;
  authPath?: string;
  projectsPath?: string;
  /** Injectable transport (defaults to global fetch). Used for tests. */
  fetchImpl?: typeof fetch;
  /** Async-job poll tuning (real adapter only). */
  poll?: { maxAttempts?: number; intervalMs?: number };
}

/** The capability the application layer depends on (D014/D018). */
export interface LumenPort {
  generate(input: LumenGenerateInput): Promise<LumenGenerateResult>;
  /** Best-effort cascade cleanup of a Lumen project (P5-E compensation). */
  release(lumenProjectId: string): Promise<void>;
}
