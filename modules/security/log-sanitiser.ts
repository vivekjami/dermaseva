// Production log guard — strips image blobs, file paths, phone numbers from logs.

const SENSITIVE_PATTERNS = [
  /data:image\/[a-z]+;base64,[A-Za-z0-9+/=]{20,}/g,
  /file:\/\/[^\s"']+\.(jpg|jpeg|png|gguf)/gi,
  /\b[6-9]\d{9}\b/g,
];

export function sanitiseLogArg(arg: unknown): unknown {
  if (typeof arg !== 'string') return arg;
  let out = arg;
  for (const pattern of SENSITIVE_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }
  return out;
}

export function installLogSanitiser(): void {
  if (__DEV__) return;
  const _warn  = console.warn.bind(console);
  const _error = console.error.bind(console);
  console.warn  = (...args: unknown[]) => _warn(...args.map(sanitiseLogArg));
  console.error = (...args: unknown[]) => _error(...args.map(sanitiseLogArg));
}
