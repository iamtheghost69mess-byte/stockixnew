export function composeProjectName(slug: string): string {
  return `stockix-${slug}`.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
}
