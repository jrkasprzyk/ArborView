/**
 * Shared utility functions used across main.ts and tooltip.ts.
 * Kept here so there is one source of truth — if you change formatting
 * logic, you only need to change it once.
 */

let _semanticCache: Record<string, string> | null = null;

function semanticColors(): Record<string, string> {
  if (!_semanticCache) {
    const s = getComputedStyle(document.documentElement);
    _semanticCache = {
      Success: s.getPropertyValue("--success").trim(),
      Failure: s.getPropertyValue("--failure").trim(),
    };
  }
  return _semanticCache;
}

/** Return a semantic colour for well-known class names, or undefined to fall back to Tableau10. */
export function semanticColor(className: string): string | undefined {
  return semanticColors()[className];
}

/**
 * Format a number for display.
 * - Returns "—" for non-finite values (NaN, Infinity).
 * - Returns "0" for exact zero.
 * - Uses scientific notation for very large (≥1000) or very small (<0.001) values.
 * - Otherwise rounds to `digits` decimal places and strips trailing zeros.
 *
 * Examples: formatNum(0.00042, 3) → "4.2e-4"
 *           formatNum(1.5000,  3) → "1.5"
 *           formatNum(1234,    3) → "1.23e+3"
 */
export function formatNum(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1000 || a < 0.001) return v.toExponential(2);
  return v.toFixed(digits).replace(/\.?0+$/, "");
}

/**
 * Escape special HTML characters so a plain string can be safely inserted
 * into innerHTML without enabling cross-site scripting (XSS) attacks.
 *
 * The five characters that have special meaning in HTML — & < > " ' —
 * are replaced with their HTML entity equivalents.
 */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" :
    c === "<" ? "&lt;" :
    c === ">" ? "&gt;" :
    c === '"' ? "&quot;" : "&#39;",
  );
}
