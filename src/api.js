const MAX_WAIT_SECONDS = 30;
const MAX_RETRIES = 2;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// onWait(seconds) is called before an automatic retry, so the UI can say what's happening.
export async function callApi(body, { onWait } = {}) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error("Couldn't reach the server. Check your connection.");
    }
    const data = await res.json().catch(() => ({ error: "The server sent back something unexpected." }));
    if (res.ok) return data;
    // Groq's free tier has per-minute limits; it says how long to wait, so wait and try again.
    if (res.status === 429 && data.retryAfter && data.retryAfter <= MAX_WAIT_SECONDS && attempt < MAX_RETRIES) {
      onWait?.(data.retryAfter);
      await sleep(data.retryAfter * 1000 + 500);
      onWait?.(0);
      continue;
    }
    throw new Error(data.error || `Request failed (${res.status})`);
  }
}
