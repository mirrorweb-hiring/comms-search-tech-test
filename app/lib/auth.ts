import cookie from "cookie";
import { API_URL } from "./utils";

export async function requireSession(request: Request) {
	const sessionCookie = getSession(request);
	if (!sessionCookie) {
		throw new Response(null, {
			status: 302,
			headers: {
				Location: "/login",
			},
		});
	}

	const response = await fetch(`${API_URL}/me`, {
		headers: {
			cookie: sessionCookie,
		},
	});
	if (!response.ok) {
		throw new Response(null, {
			status: 302,
			headers: {
				Location: "/login",
			},
		});
	}

	// Verify content type before parsing as JSON
	const contentType = response.headers.get("content-type");
	if (!contentType?.includes("application/json")) {
		const text = await response.text();
		throw new Error(
			`Expected JSON response from /me endpoint but received ${
				contentType || "unknown content type"
			}. Response: ${text.substring(0, 100)}`
		);
	}

	return {
		session: sessionCookie,
		user: await response.json(),
	};
}

export function getSession(request: Request) {
	const cookieString = request.headers.get("cookie") || "";
	const cookieValue = cookie.parse(cookieString)["comms_auth"];
	return cookieValue ? `comms_auth=${cookieValue}` : "";
}
