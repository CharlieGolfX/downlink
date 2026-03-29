/** Canonical list of tags shared across the add-feed modal and the tag filter dropdown. */
export const AVAILABLE_TAGS = [
  "Tech",
  "News",
  "Science",
  "Gaming",
  "Finance",
  "Sports",
  "Entertainment",
  "Programming",
  "Photography",
] as const;

export type Tag = (typeof AVAILABLE_TAGS)[number];
