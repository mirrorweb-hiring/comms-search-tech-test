export const API_URL = "http://localhost:8080";

export async function api(url: string, options?: RequestInit) {
	const res = await fetch(API_URL + url, options);

	// Check if response is OK before attempting to parse
	if (!res.ok) {
		const contentType = res.headers.get("content-type");
		let errorMessage = `Request failed with status ${res.status}: ${res.statusText}`;

		// Read response body as text first (can only be read once)
		const text = await res.text();

		// Try to parse as JSON if content type suggests it
		if (contentType?.includes("application/json")) {
			try {
				const errorData = JSON.parse(text);
				errorMessage = errorData.error || errorData.message || errorMessage;
			} catch {
				// If JSON parsing fails, use the text as error message
				errorMessage = text || errorMessage;
			}
		} else {
			// For non-JSON error responses (like "Gateway Timeout")
			errorMessage = text || errorMessage;
		}

		throw new Error(errorMessage);
	}

	// Read response body as text first (can only be read once)
	// This ensures we can provide helpful error messages even if JSON parsing fails
	const text = await res.text();

	// Verify content type before parsing as JSON
	const contentType = res.headers.get("content-type");
	if (!contentType?.includes("application/json")) {
		throw new Error(
			`Expected JSON response but received ${
				contentType || "unknown content type"
			}. Response: ${text.substring(0, 100)}`
		);
	}

	// Parse JSON from the text we already read
	try {
		return JSON.parse(text);
	} catch (parseError) {
		// If JSON parsing fails, we still have the text to include in the error
		throw new Error(
			`Failed to parse JSON response. Response: ${text.substring(0, 100)}`
		);
	}
}

export function classNames(...classes: string[]) {
	return classes.filter(Boolean).join(" ");
}

/**
 * Formats a timestamp as a human-readable relative time string
 * (e.g., "5 minutes ago", "2 hours ago", "3 days ago")
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Human-readable relative time string
 */
export function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diffMs = now - timestamp;
	const diffSeconds = Math.floor(diffMs / 1000);
	const diffMinutes = Math.floor(diffSeconds / 60);
	const diffHours = Math.floor(diffMinutes / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (diffSeconds < 60) {
		return "just now";
	} else if (diffMinutes < 60) {
		return `${diffMinutes} ${diffMinutes === 1 ? "minute" : "minutes"} ago`;
	} else if (diffHours < 24) {
		return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`;
	} else if (diffDays < 30) {
		return `${diffDays} ${diffDays === 1 ? "day" : "days"} ago`;
	} else {
		// For dates older than 30 days, return formatted date
		return new Date(timestamp).toLocaleDateString();
	}
}
