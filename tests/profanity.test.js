import { test } from "node:test";
import assert from "node:assert/strict";
import { profane } from "../src/profanity.js";

test("real names pass", () => {
	for (const s of ["Dickens", "Van Dyke", "Scunthorpe", "Hell", "Johnson", "Glasscock", "O'Brien", "Müller", "Baxter", "Hope Baxter", "The Baxters", ""]) {
		assert.equal(profane(s), false, JSON.stringify(s));
	}
});

test("plain and compound profanity blocks", () => {
	for (const s of ["fuck", "shitshow", "Bullshit Inc", "cuntface", "asshat", "sh1t"]) {
		assert.equal(profane(s), true, JSON.stringify(s));
	}
});

test("separator evasions block in raw text", () => {
	for (const s of ["F U C K", "f-u-c-k", "f.u.c.k"]) {
		assert.equal(profane(s), true, JSON.stringify(s));
	}
});

test("accent-obscured profanity blocks raw (confusables transformer)", () => {
	for (const s of ["Fück", "shìt", "cøck"]) {
		assert.equal(profane(s), true, JSON.stringify(s));
	}
});

test("known false positives block — documented, accepted", () => {
	assert.equal(profane("Dick"), true);
	assert.equal(profane("Penistone"), true);
});
