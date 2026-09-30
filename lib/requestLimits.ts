// Character limit, not a token budget. Shared by packet construction and the API.
// Keep complete sources; oversized requests fail visibly instead of truncating.
export const MAX_CONTEXT_CHARS = 1_000_000;
