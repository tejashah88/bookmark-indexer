export function sanitizeContent(text: string): string {
  return text
    .replaceAll('\\"', '"')
    .replaceAll("\\'", '"')
    .replaceAll('\\n', '  ')
    .replaceAll('\\t', '  ')
    .replaceAll(/\s+/g, ' ')
    .trim();
}
