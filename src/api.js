export async function callApi(body) {
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
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
