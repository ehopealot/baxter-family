import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone } from "../src/lib.js";

test("US default: bare and formatted numbers normalize to E.164", () => {
	assert.equal(normalizePhone("415 555 0100"), "+14155550100");
	assert.equal(normalizePhone("(415) 555-0100"), "+14155550100");
	assert.equal(normalizePhone("4155550100"), "+14155550100");
});

test("plus prefix overrides the default country", () => {
	assert.equal(normalizePhone("+44 7400 900123"), "+447400900123");
	assert.equal(normalizePhone("+1 202 555 0199"), "+12025550199");
});

test("unparsable input returns null", () => {
	assert.equal(normalizePhone("asdf"), null);
	assert.equal(normalizePhone("+1 (zero) 555..."), null);
	assert.equal(normalizePhone(""), null);
});

test("parsed-but-invalid numbers return null", () => {
	assert.equal(normalizePhone("555"), null);
	assert.equal(normalizePhone("1 555 0100"), null);
	assert.equal(normalizePhone("7400 900123"), null); // UK without + mis-parses as US
	assert.equal(normalizePhone("+1 555 010 2938"), null); // 555 is not an area code
});
