// Search limits shared by server code and the host page. No server imports here.

/** Searches a session may run. Each one is a paid Places call. */
export const MAX_SEARCHES = 3;

/** Candidates kept after filtering, nearest first. */
export const MAX_CANDIDATES = 25;

/** Fewer than this and the search fails with a "widen your search" error. */
export const MIN_CANDIDATES = 3;
