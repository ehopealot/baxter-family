/* Hero chat: plays the demo conversation like a real exchange. Each Baxter
   reply is preceded by an in-place typing indicator (three dots overlaying
   the message text). The row's box is reserved from the start, so the
   panel itself never resizes as messages arrive.

   Safety: the markup is complete and visible on its own. The script is the
   only thing that adds .is-staged (which hides the messages) and the
   typing dots; reduced motion and no-JS both leave the full conversation
   on screen. The chat is role="img" with a full transcript in its label,
   so the staging never affects screen readers. */
(() => {
	var log = document.querySelector("#chat-log");
	if (!log) return;
	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

	var msgs = Array.prototype.slice.call(log.querySelectorAll(".msg"));
	log.classList.add("is-staged");

	function makeDots() {
		var s = document.createElement("span");
		s.className = "typing-dots";
		s.setAttribute("aria-hidden", "true");
		s.append(
			document.createElement("i"),
			document.createElement("i"),
			document.createElement("i"),
		);
		return s;
	}

	// For each Baxter reply, drop the dots inside its msg-body as an
	// absolute overlay. They must NOT go inside the text <p>: that <p>
	// gets opacity: 0 while typing, and a child can never override its
	// parent's opacity, so dots inside it would be invisible too. The
	// <p>s keep their text in flow (hidden while typing, so the box
	// matches the final reply), and the dots sit on top. Result: the
	// row's height is the same during typing and after the reply, so
	// the panel never grows or shrinks.
	msgs.forEach((m) => {
		if (m.classList.contains("is-bax")) {
			var body = m.querySelector(".msg-body");
			if (body) body.append(makeDots());
			m.classList.add("is-typing");
		}
	});

	function wait(ms) {
		return new Promise((resolve) => {
			setTimeout(resolve, ms);
		});
	}

	async function play() {
		await wait(350);
		for (var i = 0; i < msgs.length; i++) {
			var m = msgs[i];

			// Row enters the panel (li animates in). For Baxter this happens with
			// the typing state active, so the row arrives as "Baxter is typing".
			m.classList.add("is-in");

			if (m.classList.contains("is-bax")) {
				await wait(900); // the typing beat
				m.classList.remove("is-typing"); // text fades in, dots fade out
				await wait(300); // let the reply settle before the next row
				// After Baxter's first reply, a longer beat so Sam appears to read
				// it before following up.
				if (i === 1) await wait(850);
			} else {
				await wait(650);
			}
		}
	}

	if ("IntersectionObserver" in window) {
		var io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					io.disconnect();
					play();
				}
			},
			{ threshold: 0.35 },
		);
		io.observe(log);
	} else {
		play();
	}
})();
