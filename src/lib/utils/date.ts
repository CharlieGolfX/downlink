/**
 * Formats an ISO 8601 / RFC 3339 date string into a human-friendly relative
 * timestamp such as "2 minutes ago", "3 hours ago", or "Jan 5, 2024".
 *
 * Falls back to the raw string when parsing fails.
 */
export function formatRelativeDate(isoString: string | undefined | null): string {
    if (!isoString) return "";

    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;

    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffSec < 60) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;

    return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    });
}

/**
 * Sorts an array of objects that contain an optional ISO date string field,
 * placing the newest items first. Items without a date sort to the end.
 */
export function sortByDateDesc<T>(items: T[], key: keyof T): T[] {
    return [...items].sort((a, b) => {
        const dateA = a[key] as string | undefined | null;
        const dateB = b[key] as string | undefined | null;

        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;

        return new Date(dateB).getTime() - new Date(dateA).getTime();
    });
}
