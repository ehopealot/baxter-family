import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify, HOUSEHOLD_RE } from "../src/lib.js";

test("already-clean slugs pass through unchanged", () => {
	assert.equal(slugify("andersons"), "andersons");
	assert.equal(slugify("the-smiths"), "the-smiths");
	assert.equal(slugify("hopetesters"), "hopetesters");
	assert.equal(slugify("a-1"), "a-1");
});

test("old-valid input keeps its exact bytes, including consecutive hyphens", () => {
	assert.equal(slugify("A--B"), "a--b");
	assert.equal(slugify("a--b"), "a--b");
});

test("no word stripping: The Andersons becomes the-andersons", () => {
	assert.equal(slugify("The Andersons"), "the-andersons");
});

test("runs of junk collapse to a single hyphen", () => {
	assert.equal(slugify("A_-B"), "a-b");
	assert.equal(slugify("  Multi   Space  "), "multi-space");
});

test("apostrophes drop rather than hyphenate (ASCII and typographic)", () => {
	assert.equal(slugify("O'Brien"), "obrien");
	assert.equal(slugify("O’Brien"), "obrien");
});

test("accents fold away", () => {
	assert.equal(slugify("Bédard"), "bedard");
	assert.equal(slugify("Müller"), "muller");
});

test("special Latin letters map in both cases", () => {
	assert.equal(slugify("Søren"), "soren");
	assert.equal(slugify("Ø"), "o");
	assert.equal(slugify("Ærø"), "aero");
	assert.equal(slugify("Gauß"), "gauss");
	assert.equal(slugify("Đorđe"), "dorde");
	assert.equal(slugify("Łódź"), "lodz");
});

test("edge hyphens trim; punctuation-only input yields empty", () => {
	assert.equal(slugify("--hello--"), "hello");
	assert.equal(slugify("!!!"), "");
	assert.equal(slugify("   "), "");
});

test("length is not enforced here — the handler's result check owns it", () => {
	assert.equal(slugify("a"), "a");
	assert.equal(slugify("x".repeat(40)), "x".repeat(40));
	assert.equal(HOUSEHOLD_RE.test(slugify("a")), false);
	assert.equal(HOUSEHOLD_RE.test(slugify("the-andersons")), true);
});
