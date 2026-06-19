export function sanitizeToHexColor(input: string): string {
  const hex = input.replace(/^#/, '').replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
  return hex ? `#${hex}` : '';
}
