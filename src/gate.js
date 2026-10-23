// A simple password screen. The password's SHA-256 hash lives in config.js; a correct
// entry is remembered in localStorage so relatives aren't asked again on that device.
// This is a courtesy curtain, not security: the site's files are public.

const STORAGE_KEY = "family-tree:auth";

export async function gate(config, root) {
  if (!config.passwordHash) { root.remove(); return; }
  const expected = config.passwordHash.toLowerCase();
  try {
    if (localStorage.getItem(STORAGE_KEY) === expected) { root.remove(); return; }
  } catch { /* storage unavailable: just ask */ }

  root.hidden = false;
  const form = root.querySelector("form");
  const input = root.querySelector("input");
  const error = root.querySelector(".gate-error");
  input.focus();

  await new Promise((resolve) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const hash = await sha256(input.value);
      if (hash === expected) {
        try { localStorage.setItem(STORAGE_KEY, expected); } catch { /* ignore */ }
        root.classList.add("leaving");
        setTimeout(() => { root.remove(); resolve(); }, 450);
      } else {
        error.hidden = false;
        form.classList.remove("shake");
        void form.offsetWidth; // restart the animation
        form.classList.add("shake");
        input.select();
      }
    });
  });
}

export function forgetGate() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}
