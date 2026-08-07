#!/usr/bin/env node
/**
 * Fill the templates with sample values so you can look at them.
 *
 *   node emails/preview.mjs                                  # write emails/.preview/
 *   node emails/preview.mjs --open                           # and open the HTML
 *   node emails/preview.mjs --var household=jonesfamily      # override a value
 *
 * A browser is a far more capable renderer than any email client, so this
 * flatters the templates: it catches typos, unfilled tokens and bad wrapping,
 * and it will happily render things Outlook never will. Use `send.mjs` and a
 * real inbox before trusting anything.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SAMPLE, fill, overrides } from "./sample.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, ".preview");
const values = { ...SAMPLE, ...overrides(process.argv) };

mkdirSync(OUT, { recursive: true });

const templates = readdirSync(HERE).filter((f) => /\.(html|txt)$/.test(f));
const missing = new Set();

for (const file of templates) {
	const { out, missing: gaps } = fill(readFileSync(join(HERE, file), "utf8"), values);
	gaps.forEach((k) => missing.add(k));
	writeFileSync(join(OUT, file), out);
	console.log(`  ${join("emails/.preview", file)}`);
}

if (missing.size) {
	console.error(`\n  no sample value for: ${[...missing].join(", ")}`);
	console.error("  add it to SAMPLE in emails/sample.mjs, and to the token table in emails/README.md");
	process.exitCode = 1;
}

if (process.argv.includes("--open")) {
	for (const file of templates.filter((f) => f.endsWith(".html"))) {
		execFileSync("open", [join(OUT, file)]);
	}
}
