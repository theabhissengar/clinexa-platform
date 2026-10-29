/** Split `photo.jpg` → `{ base: "photo", ext: ".jpg" }`. */
export function splitFilename(name: string): { base: string; ext: string } {
  const i = name.lastIndexOf(".");
  if (i <= 0) return { base: name, ext: "" };
  return { base: name.slice(0, i), ext: name.slice(i) };
}

export function namesEqual(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * If `desired` is free, returns it. Otherwise returns `base (1).ext`, `base (2).ext`, …
 */
export function nextDuplicateName(
  desired: string,
  existingNames: string[],
): string {
  const taken = new Set(
    existingNames.map((n) => n.trim().toLowerCase()).filter(Boolean),
  );
  if (!taken.has(desired.trim().toLowerCase())) return desired;

  const { base, ext } = splitFilename(desired.trim());
  let n = 1;
  for (;;) {
    const candidate = `${base} (${n})${ext}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
    n += 1;
  }
}
