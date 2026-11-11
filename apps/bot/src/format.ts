/**
 * Retire la mise en forme Markdown des réponses WhatsApp : étoiles de gras (*…*, **…**),
 * titres (#), soulignés (__…__), puces « * » en début de ligne. Les émojis, tirets de prix
 * (« 1 204 – 1 388 € ») et liens restent intacts.
 */
export function stripMarkdown(text: string): string {
  return text
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/, "") // titres
        .replace(/^(\s*)[*•]\s+/, "$1- ") // puce « * » → tiret simple
        .replace(/\*{1,3}([^*\n]+?)\*{1,3}/g, "$1") // *gras* / **gras** / ***…***
        .replace(/(^|\s)__([^_\n]+?)__(?=\s|$|[.,!?])/g, "$1$2")
        .replace(/\*+/g, ""), // étoiles orphelines
    )
    .join("\n")
    .trim();
}
