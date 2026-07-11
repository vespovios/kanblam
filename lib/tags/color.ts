/**
 * Deterministic color derivation for tag names.
 *
 * Uses djb2 string hash → modulo PALETTE.length → lookup in the warm/desaturated
 * KanBlam palette. Same lowercased trimmed name always returns the same
 * color. Result is stored on Tag.color at creation; users can override
 * via Settings (rename does NOT re-derive).
 */

// 10 hues distributed across the wheel + 2 low-chroma neutrals (stone, sand).
// Lightness ~0.91–0.95 (slight variation kept for visual differentiation).
// Each entry is the BACKGROUND color; paired darker text via TEXT_PALETTE.
//
// Tag.color is stored on the row; adding palette entries here does NOT
// re-derive existing tags' colors. Buckets line up with TEXT_PALETTE; if
// you change PALETTE.length you MUST update TEXT_PALETTE in lockstep.
export const PALETTE: readonly string[] = [
  "#fce7e7", // 0  warm rose
  "#fce7d6", // 1  peach
  "#fcedc7", // 2  butter
  "#f0f3d4", // 3  pale lime
  "#dcf3dc", // 4  sage
  "#d4f3e8", // 5  mint
  "#d4ecf3", // 6  sky
  "#dde2f3", // 7  periwinkle
  "#e6dcf3", // 8  lavender
  "#f3dcec", // 9  blush
  "#ede5e1", // 10 stone
  "#e6dfd4", // 11 sand
] as const;

// Matching darker text colors (same hue, lower lightness ~0.35).
const TEXT_PALETTE: readonly string[] = [
  "#7a3026",
  "#7a4a26",
  "#705a1a",
  "#5a6420",
  "#2a5a30",
  "#1f5a4a",
  "#1f4a5a",
  "#2e3a6e",
  "#4a3070",
  "#702e5a",
  "#5a4035",
  "#5a4830",
] as const;

function djb2(s: string): number {
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash + s.charCodeAt(i)) | 0;
  }
  return hash >>> 0; // coerce to u32
}

function bucketFor(name: string): number {
  const normalized = name.trim().toLowerCase();
  return djb2(normalized) % PALETTE.length;
}

export function colorFromName(name: string): string {
  return PALETTE[bucketFor(name)];
}

/** Text color paired with `colorFromName(name)`. */
export function tagTextColor(name: string): string {
  return TEXT_PALETTE[bucketFor(name)];
}
