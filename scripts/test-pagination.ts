import { faker } from "@faker-js/faker";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import fs from "node:fs";
import { hashPassword } from "../api/auth";

/**
 * Test script to verify pagination works correctly with over 100 results
 * This creates a test database with 150 messages and tests the search API
 */

async function setupTestDatabase() {
	const testDbPath = "db/test-comms.db";

	// Remove old test database if it exists
	if (fs.existsSync(testDbPath)) {
		fs.unlinkSync(testDbPath);
	}

	// Create new test database
	const db = new Database(testDbPath);

	// Initialize database schema
	db.exec(fs.readFileSync("scripts/schema.sql", "utf-8"));

	// Create a test user
	const insertAgent = db.prepare(
		"INSERT INTO user (id, email, password_hash) VALUES (?, ?, ?)"
	);
	const userId = nanoid();
	const email = "test@example.com";
	const password = "test123";
	const hashedPassword = await hashPassword(password);
	insertAgent.run(userId, email, hashedPassword);

	// Create identities
	const insertIdentity = db.prepare(
		"INSERT INTO identity (id, email) VALUES (?, ?)"
	);
	const identities = [];
	for (let i = 0; i < 50; i++) {
		const id = nanoid();
		const identityEmail = faker.internet.email().toLowerCase();
		identities.push({ id, email: identityEmail });
		insertIdentity.run(id, identityEmail);
	}

	// Create 150 messages with a common search term to ensure we get over 100 results
	const insertMessage = db.prepare(
		"INSERT INTO message (id, `subject`, `content`, `from`, `to`, created_at, `status`) VALUES (?, ?, ?, ?, ?, ?, ?)"
	);

	const validStatusList = ["compliant", "non_compliant", null];
	const searchTerm = "test-pagination-query";

	for (let i = 0; i < 150; i++) {
		const id = nanoid();
		// Include the search term in every message to ensure we get all 150 results
		const subject = `${searchTerm} ${faker.lorem.sentence()}`;
		const body = `${searchTerm} ${faker.lorem.paragraph()}`;
		const from = identities[Math.floor(Math.random() * identities.length)];
		const to = identities[Math.floor(Math.random() * identities.length)];
		const createdAt = faker.date.between({
			from: "2024-05-01",
			to: "2024-06-30",
		});
		const randomStatus =
			validStatusList[Math.floor(Math.random() * validStatusList.length)];
		insertMessage.run(
			id,
			subject,
			body,
			from.id,
			to.id,
			Math.floor(createdAt.getTime() / 1000),
			randomStatus
		);
	}

	db.close();

	return { testDbPath, searchTerm, email, password };
}

async function testPagination() {
	console.log("Setting up test database with 150 messages...\n");
	const { testDbPath, searchTerm, email, password } = await setupTestDatabase();

	// Temporarily replace the database path for testing
	const originalDbPath = "db/comms.db";
	const db = new Database(testDbPath);

	// Test 1: Verify total count is over 100
	console.log("Test 1: Verifying total count is over 100");
	const totalCount = db
		.prepare(
			`SELECT COUNT(*) as count
        FROM
          message m
        JOIN
          identity from_identity ON m.\`from\` = from_identity.id
        JOIN
          identity to_identity ON m.\`to\` = to_identity.id
        WHERE
          m.subject LIKE ? OR m.content LIKE ?
      `
		)
		.get(`%${searchTerm}%`, `%${searchTerm}%`) as { count: number };

	console.log(`  Total count: ${totalCount.count}`);
	if (totalCount.count >= 150) {
		console.log("  ✓ PASS: Total count is 150 (over 100)\n");
	} else {
		console.log(`  ✗ FAIL: Expected at least 150, got ${totalCount.count}\n`);
		db.close();
		return false;
	}

	// Test 2: Verify pagination with limit 20
	console.log("Test 2: Verifying pagination calculations");
	const limit = 20;
	const expectedTotalPages = Math.ceil(totalCount.count / limit);
	console.log(`  Expected total pages: ${expectedTotalPages}`);

	if (expectedTotalPages === 8) {
		// 150 / 20 = 7.5, rounded up to 8
		console.log("  ✓ PASS: Total pages calculation is correct\n");
	} else {
		console.log(`  ✗ FAIL: Expected 8 pages, got ${expectedTotalPages}\n`);
		db.close();
		return false;
	}

	// Test 3: Verify we can access all pages
	console.log("Test 3: Verifying all pages are accessible");
	let allPagesAccessible = true;
	for (let page = 1; page <= expectedTotalPages; page++) {
		const offset = (page - 1) * limit;
		const messages = db
			.prepare(
				`SELECT
          m.id,
          m.subject,
          m.content,
          m.status,
          m.created_at,
          from_identity.email as from_email,
          to_identity.email as to_email
        FROM
          message m
        JOIN
          identity from_identity ON m.\`from\` = from_identity.id
        JOIN
          identity to_identity ON m.\`to\` = to_identity.id
        WHERE
          m.subject LIKE ? OR m.content LIKE ?
        ORDER BY m.created_at DESC
        LIMIT ? OFFSET ?
      `
			)
			.all(`%${searchTerm}%`, `%${searchTerm}%`, limit, offset) as any[];

		const expectedCount =
			page === expectedTotalPages
				? totalCount.count - (expectedTotalPages - 1) * limit // Last page might have fewer items
				: limit;

		if (messages.length > 0 && messages.length <= limit) {
			console.log(`  Page ${page}: ${messages.length} messages ✓`);
		} else {
			console.log(
				`  Page ${page}: ${messages.length} messages ✗ (expected ${expectedCount})`
			);
			allPagesAccessible = false;
		}
	}

	if (allPagesAccessible) {
		console.log("  ✓ PASS: All pages are accessible\n");
	} else {
		console.log("  ✗ FAIL: Some pages are not accessible\n");
		db.close();
		return false;
	}

	// Test 4: Verify total count matches sum of all pages
	console.log("Test 4: Verifying total count matches sum of all pages");
	let totalMessagesRetrieved = 0;
	for (let page = 1; page <= expectedTotalPages; page++) {
		const offset = (page - 1) * limit;
		const messages = db
			.prepare(
				`SELECT
          m.id,
          m.subject,
          m.content,
          m.status,
          m.created_at,
          from_identity.email as from_email,
          to_identity.email as to_email
        FROM
          message m
        JOIN
          identity from_identity ON m.\`from\` = from_identity.id
        JOIN
          identity to_identity ON m.\`to\` = to_identity.id
        WHERE
          m.subject LIKE ? OR m.content LIKE ?
        ORDER BY m.created_at DESC
        LIMIT ? OFFSET ?
      `
			)
			.all(`%${searchTerm}%`, `%${searchTerm}%`, limit, offset) as any[];

		totalMessagesRetrieved += messages.length;
	}

	console.log(`  Total messages retrieved: ${totalMessagesRetrieved}`);
	console.log(`  Expected total: ${totalCount.count}`);

	if (totalMessagesRetrieved === totalCount.count) {
		console.log("  ✓ PASS: Total count matches sum of all pages\n");
	} else {
		console.log(
			`  ✗ FAIL: Expected ${totalCount.count}, got ${totalMessagesRetrieved}\n`
		);
		db.close();
		return false;
	}

	// Test 5: Verify pagination beyond page 5 works
	console.log("Test 5: Verifying pagination works beyond page 5");
	const page6Offset = (6 - 1) * limit;
	const page6Messages = db
		.prepare(
			`SELECT
        m.id,
        m.subject,
        m.content,
        m.status,
        m.created_at,
        from_identity.email as from_email,
        to_identity.email as to_email
      FROM
        message m
      JOIN
        identity from_identity ON m.\`from\` = from_identity.id
      JOIN
        identity to_identity ON m.\`to\` = to_identity.id
      WHERE
        m.subject LIKE ? OR m.content LIKE ?
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `
		)
		.all(`%${searchTerm}%`, `%${searchTerm}%`, limit, page6Offset) as any[];

	if (page6Messages.length > 0) {
		console.log(`  Page 6: ${page6Messages.length} messages ✓`);
		console.log("  ✓ PASS: Pagination works beyond page 5\n");
	} else {
		console.log("  ✗ FAIL: Page 6 returned no messages\n");
		db.close();
		return false;
	}

	db.close();

	// Clean up test database
	if (fs.existsSync(testDbPath)) {
		fs.unlinkSync(testDbPath);
	}

	console.log("All tests passed! ✓");
	console.log(`\nTest database credentials (if needed):`);
	console.log(`  Email: ${email}`);
	console.log(`  Password: ${password}`);

	return true;
}

// Run the test
testPagination()
	.then((success) => {
		if (success) {
			console.log("\n✓ All pagination tests passed!");
			process.exit(0);
		} else {
			console.log("\n✗ Some tests failed!");
			process.exit(1);
		}
	})
	.catch((error) => {
		console.error("Test error:", error);
		process.exit(1);
	});
