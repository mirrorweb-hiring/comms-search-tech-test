export const API_URL = "http://localhost:8080";

export async function api(url: string, options?: RequestInit) {
	const res = await fetch(API_URL + url, options);

	// Check if response is OK before attempting to parse
	if (!res.ok) {
		const contentType = res.headers.get("content-type");
		let errorMessage = `Request failed with status ${res.status}: ${res.statusText}`;

		// Try to extract error message from response body
		if (contentType?.includes("application/json")) {
			try {
				const errorData = await res.json();
				errorMessage = errorData.error || errorData.message || errorMessage;
			} catch {
				// If JSON parsing fails, fall back to text
				const text = await res.text();
				errorMessage = text || errorMessage;
			}
		} else {
			// For non-JSON error responses (like "Gateway Timeout")
			const text = await res.text();
			errorMessage = text || errorMessage;
		}

		throw new Error(errorMessage);
	}

	// Verify content type before parsing as JSON
	const contentType = res.headers.get("content-type");
	if (!contentType?.includes("application/json")) {
		const text = await res.text();
		throw new Error(
			`Expected JSON response but received ${
				contentType || "unknown content type"
			}. Response: ${text.substring(0, 100)}`
		);
	}

	return await res.json();
}

export function classNames(...classes: string[]) {
	return classes.filter(Boolean).join(" ");
}
