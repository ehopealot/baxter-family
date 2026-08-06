/* Hero demo: three conversations behind a tablist, each played back like a real
   exchange — Sam's message lands, Baxter types, Baxter answers.

   Safety first: the markup is complete and all three panels are visible before
   this runs. The script is the only thing that hides the inactive ones, reveals
   the tabs, and stages the messages. No JS, or reduced motion, and you get the
   conversations in full with nothing moving. Each .phone is role="img" with the
   whole transcript in its label, so none of the staging reaches a screen reader.

   Auto-advance runs only while motion is welcome, pauses under the pointer or
   keyboard focus, and stops for good the moment someone picks a tab themselves.
   Taking a choice back off a visitor who just made one is the rude version. */
(() => {
	"use strict";

	var demo = document.querySelector(".demo");
	if (!demo) return;

	var tabsWrap = demo.querySelector(".demo-tabs");
	var stage = demo.querySelector(".demo-stage");
	var tabs = Array.prototype.slice.call(demo.querySelectorAll('[role="tab"]'));
	if (!tabsWrap || !stage || tabs.length === 0) return;

	var panels = tabs.map(function (t) {
		return document.getElementById(t.getAttribute("aria-controls"));
	});
	if (panels.some(function (p) { return !p; })) return;

	var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	// Beats are held BEFORE a message lands, not after, which is what gives each
	// turn its reason: Baxter takes a moment to start typing, and Sam takes
	// longer because Sam has to read the reply first. Waiting after a message
	// instead collapses that difference and the blue bubbles pop straight in.
	var DWELL = 2000; // pause on a finished thread before moving on
	var LEAD = 400; // before the very first message
	var BEFORE_BAX = 730; // Baxter starts typing
	var BEFORE_SAM = 1150; // Sam reads the reply, then types
	var TYPING = 900; // how long Baxter appears to be typing
	var SETTLE = 300; // after a reply lands

	var active = 0;
	// Two independent clocks. Sharing one meant a hover-pause cleared the
	// timeout that playback was awaiting, freezing the thread mid-animation
	// with no way to resume. stepTimer is never cleared from outside; a
	// switched-away playback bails on the token check instead.
	var stepTimer = null;
	var advanceTimer = null;
	var token = 0; // invalidates an in-flight playback when we switch away
	var auto = !reduce;
	var paused = false;
	var done = false; // current thread has finished playing

	// Take over the layout: tabs become usable, panels collapse into one cell.
	stage.classList.add("is-tabbed");
	tabsWrap.hidden = false;

	function wait(ms) {
		return new Promise(function (resolve) {
			stepTimer = setTimeout(resolve, ms);
		});
	}

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

	// One typing bubble per Baxter turn, added once and reused on replay.
	function prepare(log) {
		if (log.dataset.prepared) return;
		log.dataset.prepared = "1";
		log.querySelectorAll(".msg.is-bax .msg-body").forEach(function (body) {
			body.append(makeDots());
		});
	}

	function scheduleAdvance() {
		clearTimeout(advanceTimer);
		if (!auto || paused || !done || tabs.length < 2) return;
		advanceTimer = setTimeout(function () {
			select((active + 1) % tabs.length, false);
		}, DWELL);
	}

	async function play(log, mine) {
		if (reduce) return;
		prepare(log);
		var msgs = Array.prototype.slice.call(log.querySelectorAll(".msg"));

		log.classList.add("is-staged");
		msgs.forEach(function (m) {
			m.classList.remove("is-in");
			if (m.classList.contains("is-bax")) m.classList.add("is-typing");
		});

		await wait(LEAD);
		for (var i = 0; i < msgs.length; i++) {
			if (mine !== token) return; // switched away mid-playback
			var m = msgs[i];
			var isBax = m.classList.contains("is-bax");

			if (i > 0) {
				await wait(isBax ? BEFORE_BAX : BEFORE_SAM);
				if (mine !== token) return;
			}

			// For Baxter this is the typing bubble arriving, not the reply.
			m.classList.add("is-in");

			if (isBax) {
				await wait(TYPING);
				if (mine !== token) return;
				m.classList.remove("is-typing"); // dots give way to the reply
				await wait(SETTLE);
			}
		}
		if (mine !== token) return;
		done = true;
		scheduleAdvance();
	}

	function select(i, byHand) {
		clearTimeout(advanceTimer);
		token++;
		active = i;
		done = false;

		// A visitor who picks a thread has said what they want to look at.
		if (byHand) auto = false;

		tabs.forEach(function (t, n) {
			var on = n === i;
			t.setAttribute("aria-selected", on ? "true" : "false");
			t.tabIndex = on ? 0 : -1;
			panels[n].hidden = !on;
		});

		play(panels[i].querySelector(".chat-log"), token);
	}

	tabs.forEach(function (tab, i) {
		tab.tabIndex = i === 0 ? 0 : -1;
		tab.addEventListener("click", function () {
			select(i, true);
		});
		tab.addEventListener("keydown", function (e) {
			var next =
				e.key === "ArrowRight" ? (i + 1) % tabs.length
				: e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length
				: e.key === "Home" ? 0
				: e.key === "End" ? tabs.length - 1
				: -1;
			if (next < 0) return;
			e.preventDefault();
			select(next, true);
			tabs[next].focus();
		});
	});

	// Keyboard focus pauses; the pointer deliberately does not. Hovering is
	// ambient — a cursor resting anywhere over the hero would silently stall the
	// carousel and read as broken. Focus is a statement of intent, and moving a
	// panel out from under someone arrowing through the tabs is a real problem.
	demo.addEventListener("focusin", function () {
		paused = true;
		clearTimeout(advanceTimer);
	});
	demo.addEventListener("focusout", function (e) {
		// Also fires moving between tabs inside the demo; that isn't leaving.
		if (e.relatedTarget && demo.contains(e.relatedTarget)) return;
		paused = false;
		scheduleAdvance();
	});

	function start() {
		tabs.forEach(function (t, n) {
			panels[n].hidden = n !== 0;
			t.setAttribute("aria-selected", n === 0 ? "true" : "false");
		});
		if (reduce) return; // panels switch by hand; nothing animates or advances
		select(0, false);
	}

	if ("IntersectionObserver" in window) {
		var io = new IntersectionObserver(
			function (entries) {
				if (entries.some(function (e) { return e.isIntersecting; })) {
					io.disconnect();
					start();
				}
			},
			{ threshold: 0.35 },
		);
		io.observe(demo);
	} else {
		start();
	}
})();
