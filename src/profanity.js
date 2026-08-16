/* Profanity gate for signup fields, built on obscenity's English dataset.

   Two matchers run as a union because each covers what the other misses:
   - strict catches compounds whose words touch or space-separate
     ("Bullshit Inc") but lets spaced-out letter evasion ("F U C K") by;
   - evasive adds skipNonAlphabeticTransformer, collapsing separators so
     "F U C K" and "f-u-c-k" match — but that same collapsing turns
     "Bullshit Inc" into "bullshitinc" and loses it.

   Both carry the dataset's whitelist with its recommended transformers, so
   real names like "Van Dyke", "Dickens" and "Scunthorpe" pass. Known
   accepted false positives: "Dick", "Penistone". This is a taste gate, not
   a security boundary — misses cost nothing, blocks cost a confusing retry. */
import {
	RegExpMatcher,
	englishDataset,
	englishRecommendedBlacklistMatcherTransformers,
	englishRecommendedWhitelistMatcherTransformers,
	skipNonAlphabeticTransformer,
} from "obscenity";

function buildMatcher(extra = []) {
	return new RegExpMatcher({
		...englishDataset.build(),
		blacklistMatcherTransformers: [...englishRecommendedBlacklistMatcherTransformers, ...extra],
		whitelistMatcherTransformers: englishRecommendedWhitelistMatcherTransformers,
	});
}

const strict = buildMatcher();
const evasive = buildMatcher([skipNonAlphabeticTransformer()]); // factory — invoke it

/* True when either matcher fires. */
export function profane(text) {
	const s = String(text || "");
	return strict.hasMatch(s) || evasive.hasMatch(s);
}
