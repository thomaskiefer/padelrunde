export function normalizeSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isValidSlugLength(slug: string): boolean {
  return slug.length >= 3 && slug.length <= 48;
}
