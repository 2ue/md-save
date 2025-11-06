/**
 * Path security utilities
 *
 * Provides safe path manipulation to prevent:
 * - Path traversal attacks (../)
 * - Excessive nesting
 * - Invalid characters
 */

const MAX_PATH_DEPTH = 10;

/**
 * Sanitize user-provided configuration paths (like customDownloadPath)
 * Removes dangerous patterns like '..' and '.'
 * Normalizes separators to forward slash
 *
 * @param path User-provided path to sanitize
 * @returns Clean path without dangerous patterns
 */
export function sanitizePath(path: string): string {
  if (!path) return '';

  // Normalize separators: \ → /
  const normalized = path.replace(/\\/g, '/');

  // Split, filter dangerous segments, limit depth
  const segments = normalized
    .split('/')
    .filter(segment => segment && segment !== '.' && segment !== '..') // Remove empty, '.', '..'
    .slice(0, MAX_PATH_DEPTH); // Limit nesting depth

  return segments.join('/');
}

/**
 * Sanitize template-generated filenames that may contain directory structures
 * Simple approach: replace '..' with '/' and compress multiple '/' to single '/'
 *
 * @param filename Template-generated filename (may contain '/'), but not dangerous patterns
 * @returns Clean filename preserving directory structures
 */
export function sanitizeTemplateFilename(filename: string): string {
  if (!filename) return '';

  // Normalize separators: \ → /
  let normalized = filename.replace(/\\/g, '/');

  // Replace '..' with '/'
  normalized = normalized.replace(/\.\./g, '/');

  // Remove single '.' (current directory references)
  normalized = normalized.replace(/\/\.\//g, '/');

  // Remove leading './' if present
  normalized = normalized.replace(/^\.\//g, '');

  // Compress multiple '/' to single '/'
  normalized = normalized.replace(/\/+/g, '/');

  // Remove leading slash (unless it's just '/')
  if (normalized.length > 1 && normalized.startsWith('/')) {
    normalized = normalized.substring(1);
  }

  // Limit depth
  const segments = normalized.split('/').filter(s => s).slice(0, MAX_PATH_DEPTH);
  return segments.join('/');
}

/**
 * Build a safe file path by combining base directory and filename
 * Both parts are sanitized before concatenation
 *
 * @param basePath Base directory path (e.g., "MyNotes/Web" or "/webdav/docs")
 * @param filename Filename (may contain subdirectories, e.g., "2025-11-05/article.md")
 * @returns Safe combined path
 *
 * @example
 * buildSafePath("MyNotes/Web", "2025-11-05/article.md")
 * // Returns: "MyNotes/Web/2025-11-05/article.md"
 *
 * @example
 * buildSafePath("../../../System", "evil.md")
 * // Returns: "System/evil.md" (../ stripped)
 */
export function buildSafePath(basePath: string, filename: string): string {
  const cleanBase = sanitizePath(basePath);           // User-configured base path (strict)
  const cleanFile = sanitizeTemplateFilename(filename); // Template filename (permissive but safe)

  if (!cleanBase) return cleanFile;
  if (!cleanFile) return cleanBase;

  return `${cleanBase}/${cleanFile}`;
}

/**
 * Validate if a path is safe for use
 * Checks for common attack patterns but allows legitimate directory structures
 *
 * @param path Path to validate
 * @returns True if path appears safe
 */
export function isPathSafe(path: string): boolean {
  if (!path) return false;

  // Check for null bytes (can bypass security in some systems)
  if (path.includes('\0')) return false;

  // Check for path traversal patterns - only when used with directory traversal
  // Allow "../" only if it's at the start and not combined with other segments
  const segments = path.split('/');
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment === '..') {
      // If we have a ".." segment that's not at the beginning, it's dangerous
      if (i > 0) {
        return false;
      }
    }
  }

  // Check depth
  const depth = path.split('/').filter(s => s && s !== '..').length;
  if (depth > MAX_PATH_DEPTH) return false;

  // Check for other dangerous patterns
  if (path.includes('//') || path.includes('\\')) return false;

  return true;
}

/**
 * Extract directory and filename from a full path
 *
 * @param fullPath Full path (e.g., "docs/2025/article.md")
 * @returns Object with directory and filename
 *
 * @example
 * splitPath("docs/2025/article.md")
 * // Returns: { directory: "docs/2025", filename: "article.md" }
 */
export function splitPath(fullPath: string): { directory: string; filename: string } {
  const cleanPath = sanitizePath(fullPath);
  const lastSlashIndex = cleanPath.lastIndexOf('/');

  if (lastSlashIndex === -1) {
    return { directory: '', filename: cleanPath };
  }

  return {
    directory: cleanPath.substring(0, lastSlashIndex),
    filename: cleanPath.substring(lastSlashIndex + 1)
  };
}
