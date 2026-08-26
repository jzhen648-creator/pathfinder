/**
 * Stable Subject presentation keys accepted by the API. Labels, groups,
 * search synonyms and Lucide component mappings live in the mobile registry;
 * this backend list is the validation boundary for the separately deployed
 * API repository.
 */
export const ALMANAC_SUBJECT_ICON_REGISTRY_VERSION = 1 as const;

export const ALMANAC_SUBJECT_ICON_KEYS = [
  "house", "building-2", "key", "landmark", "hammer", "wrench", "truck", "map-pin", "sofa", "warehouse",
  "briefcase-business", "briefcase", "graduation-cap", "book-open", "award", "presentation", "laptop", "languages", "search", "notebook-pen",
  "wallet", "piggy-bank", "chart-line", "banknote", "calculator", "receipt", "credit-card", "shield-check", "file-text", "hand-coins",
  "users", "heart", "heart-handshake", "baby", "hand-heart", "user-plus", "message-circle", "handshake", "paw-print",
  "activity", "heart-pulse", "dumbbell", "brain", "moon", "stethoscope", "apple", "salad", "scale", "sparkles",
  "plane", "map", "compass", "car", "ship", "tent", "globe", "train-front", "ticket-check", "ship-wheel",
  "rocket", "code", "lightbulb", "palette", "pen-tool", "camera", "video", "folder", "music", "target",
  "circle", "star", "flag", "telescope", "sprout", "utensils", "calendar-days", "sun",
] as const;

export type AlmanacSubjectIconKey = (typeof ALMANAC_SUBJECT_ICON_KEYS)[number];
