/* Sample values for previewing and test-sending. One copy, so a preview and a
 * test send can't disagree about what they're showing you.
 *
 * Deliberately obvious placeholders. If one of these ever turns up in a real
 * person's inbox it should be unmistakable rather than plausible — which is why
 * the phone number is a 555 and the household is nobody's.
 */
export const SAMPLE = {
	name: "Sam",
	household: "smithfam",
	invite_url: "https://bax.bot/?code=BAX-7K3M",
	expires_sentence: "It's good for the next 14 days.",
	sender_name: "Erik",
	assistant_phone: "(510) 555-0123",
	assistant_phone_e164: "+15105550123",
	home_url: "https://home.bax.bot",
};

/* Fill {{tokens}}. Anything without a value is left standing and reported, so
 * a typo shows up as a loud {{typo}} rather than as an empty space. */
export function fill(source, values = SAMPLE) {
	const missing = new Set();
	const out = source.replace(/\{\{(\w+)\}\}/g, (whole, key) => {
		if (!(key in values)) {
			missing.add(key);
			return whole;
		}
		return values[key];
	});
	return { out, missing: [...missing] };
}

/* --var key=value pairs, for overriding a sample without editing this file. */
export function overrides(argv) {
	const out = {};
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] !== "--var") continue;
		const pair = argv[i + 1] || "";
		const eq = pair.indexOf("=");
		if (eq > 0) out[pair.slice(0, eq)] = pair.slice(eq + 1);
	}
	return out;
}
