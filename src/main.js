import { Experience } from "./core/Experience.js";
try {
  window.__exp = new Experience(document.querySelector("canvas"));
} catch (e) {
  document.querySelector("#status").textContent =
    "The 3D harbour could not start. Please reload in a WebGL-capable browser.";
  console.error(e);
}

// Quiet chrome: the harbour leads; controls visit when called and retire when left.
const PIN_KEY = "fremantle-chrome-pin", TOP_ZONE = 96, BOTTOM_ZONE = 150, RETIRE_MS = 2600;
const nav = document.querySelector("nav.chrome"), hint = document.querySelector(".chrome-hint"), pinBtn = document.querySelector("#pin-controls");
let pinned = false; try { pinned = localStorage.getItem(PIN_KEY) === "1"; } catch {}
let chrome = true, focusWithin = false, retireTimer = 0;
const apply = () => { const on = chrome || pinned; nav.classList.toggle("chrome-on", on); hint.hidden = on; };
const retireSoon = () => { clearTimeout(retireTimer); retireTimer = setTimeout(() => { if (!focusWithin) { chrome = false; apply(); } }, RETIRE_MS); };
const wake = () => { chrome = true; apply(); retireSoon(); };
document.addEventListener("pointermove", (e) => { if (e.pointerType === "touch") return; if (e.clientY < TOP_ZONE || e.clientY > innerHeight - BOTTOM_ZONE) wake(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !document.querySelector("#info").open) { focusWithin = false; chrome = false; apply(); } });
document.addEventListener("focusin", (e) => { if (nav.contains(e.target)) { focusWithin = true; clearTimeout(retireTimer); chrome = true; apply(); } });
document.addEventListener("focusout", (e) => { if (!nav.contains(e.relatedTarget)) { focusWithin = false; retireSoon(); } });
hint.addEventListener("click", wake);
const setPin = (next) => { pinned = next; try { next ? localStorage.setItem(PIN_KEY, "1") : localStorage.removeItem(PIN_KEY); } catch {} pinBtn.setAttribute("aria-pressed", String(next)); pinBtn.textContent = next ? "Unpin" : "Pin"; pinBtn.title = next ? "Let controls retire" : "Keep controls visible"; if (next) { chrome = true; apply(); } else retireSoon(); };
pinBtn.addEventListener("click", () => setPin(!pinned));
if (pinned) setPin(true);
// Place trail: rope-hitched harbour markers, one per place.
const exp = window.__exp, tokens = [...document.querySelectorAll("[data-view]")];
const mark = (i) => tokens.forEach((b) => { b.setAttribute("aria-checked", String(+b.dataset.view === i)); b.tabIndex = +b.dataset.view === i ? 0 : -1; });
tokens.forEach((b) => {
  b.addEventListener("click", () => { exp.select(+b.dataset.view); mark(+b.dataset.view); });
  b.addEventListener("keydown", (e) => { if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return; e.preventDefault(); const i = +b.dataset.view, n = (i + (e.key === "ArrowRight" ? 1 : tokens.length - 1)) % tokens.length; exp.select(n); mark(n); tokens[n].focus(); });
});
const origSelect = exp.select.bind(exp);
exp.select = (i) => { origSelect(i); mark(i); };
retireSoon();
