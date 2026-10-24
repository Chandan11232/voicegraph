// Voicegraph's AI endpoint (an open model on Groq). Three modes:
//   edit:   spoken command + current graph (+ selection) -> updated graph + summary
//   review: graph -> architecture findings tied to node ids
//   docs:   graph -> README-ready architecture write-up (markdown)
import { KINDS, COLORS, sanitizeGraph, graphForPrompt } from "../shared/graph.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const MAX_COMMAND_CHARS = 1000;
const MAX_GRAPH_CHARS = 24000;

// Best-effort per-instance rate limit so a public link can't drain the API key.
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const hits = new Map();

const GRAPH_FORMAT = `{
  "direction": "LR" | "TB",
  "nodes": [{ "id": "api", "label": "Orders API", "kind": "service", "tech": "Node.js", "color": null, "group": "backend" }],
  "edges": [{ "from": "web", "to": "api", "label": "REST", "style": "solid" }],
  "groups": [{ "id": "backend", "label": "Backend" }]
}
- kind is one of: ${KINDS.join(", ")}.
- color is null or one of: ${COLORS.join(", ")}.
- group is null or the id of an entry in "groups".
- style is "solid", or "dashed" for async/event/optional flows.
- tech is an optional short technology name ("Postgres 16", "Redis", "Next.js"), or "".`;

const EDIT_PROMPT = `You are the engine behind Voicegraph, a voice-controlled architecture diagram editor.
The user speaks a command; you get the current diagram as JSON and return the complete updated diagram.

Diagram JSON format:
${GRAPH_FORMAT}

Respond with a JSON object only: {"graph": <the full updated diagram>, "summary": "<one short sentence>"}

Rules:
- Edit minimally. Keep every existing id, label, kind, tech, color, group and edge unless the command changes it. Always return the whole diagram.
- New ids are short, lowercase, stable words (cache, auth, queue2). Never reuse an id for a different thing.
- Pick the kind that fits: users/browsers/mobile apps -> client; APIs/servers/backends -> service; lambdas/cron/workers -> function; SQL/NoSQL -> database; Redis/Memcached/CDN cache -> cache; Kafka/SQS/RabbitMQ/pub-sub -> queue; S3/blob/files -> storage; Stripe/Twilio/any third-party -> external; LLMs/ML models/vector search -> ai.
- Put the technology in "tech" and the role in "label" when both are said ("a Postgres database for orders" -> label "Orders DB", tech "Postgres").
- "between A and B" means replace the A->B edge with A->new->B.
- If the user says "this", "these", "it" or "the selected one", they mean the selected nodes listed below.
- Spoken input can contain filler or self-corrections ("no wait, I mean Redis"); follow the corrected intent.
- If the user asks a question about the diagram or the system it shows ("what happens if Redis goes down?", "why is the queue there?", "explain this diagram", "how does a request reach the database?"), do NOT change anything: return the diagram exactly as given and answer in "summary" in 1-3 plain sentences, referring to boxes by their labels.
- If the command is unclear or not about the diagram at all, return the diagram unchanged and ask a short clarifying question in "summary".
- Otherwise "summary" is one short, natural, past-tense sentence saying what changed. It may be read aloud.`;

const REVIEW_PROMPT = `You are a pragmatic senior software architect reviewing a system diagram.

Diagram JSON format:
${GRAPH_FORMAT}

Find the 3 to 6 most important, concrete issues or improvements visible in THIS diagram: single points of failure, missing caching or queues where load is obvious, direct database access from clients, missing auth, synchronous calls to slow third parties, missing observability, unclear data flow. Skip generic advice that doesn't fit what is drawn.

Respond with a JSON object only:
{"summary": "<one sentence overall verdict>", "findings": [{"nodeIds": ["api"], "severity": "high" | "medium" | "low", "title": "<max 8 words>", "detail": "<1-2 sentences: the risk and the fix>"}]}
nodeIds must be ids from the diagram (may be empty for system-wide points).`;

const DOCS_PROMPT = `You write clear, concise technical documentation.
Given a system diagram as JSON, write the architecture section of a README in GitHub markdown.

Diagram JSON format:
${GRAPH_FORMAT}

Structure:
### Overview
2-3 sentences on what the system does and its overall shape.
### Components
A bullet per component: **Label** (tech): its responsibility, inferred sensibly from its role and connections.
### Data flow
A numbered walkthrough of the main request path, following the edges.

Do not include a diagram or code block; one is added separately. Do not invent components that are not in the diagram.
Respond with a JSON object only: {"markdown": "<the markdown>"}`;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT;
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

class UserError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Groq's free tier has per-minute token limits; a short wait usually clears them.
async function fetchWithRetry(init) {
  const response = await fetch(GROQ_URL, init);
  if (response.status !== 429) return response;
  const detail = await response.clone().text().catch(() => "");
  const wait = Number(response.headers.get("retry-after")) || Number(detail.match(/try again in ([\d.]+)s/)?.[1]);
  if (!wait || wait > 8) return response;
  await sleep(wait * 1000 + 250);
  return fetch(GROQ_URL, init);
}

async function askModel(system, user, maxTokens = 4096) {
  let response;
  try {
    response = await fetchWithRetry({
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
  } catch (err) {
    console.error("Groq request failed", err);
    throw new UserError(502, "Couldn't reach the AI service. Try again.");
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Groq API error", response.status, detail);
    if (response.status === 401) throw new UserError(500, "The server's Groq API key is missing or invalid.");
    if (response.status === 429) throw new UserError(429, "The AI is busy right now. Try again in a moment.");
    throw new UserError(502, "The AI couldn't process that. Try again.");
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  if (choice?.finish_reason === "length") throw new UserError(502, "The answer got too long to finish. Try a smaller diagram or change.");
  try {
    return JSON.parse(choice.message.content);
  } catch {
    console.error("Unparseable model output", choice?.message?.content?.slice(0, 500));
    throw new UserError(502, "The AI sent back something I couldn't read. Try again.");
  }
}

async function edit({ command, graph, selection }) {
  if (!command) throw new UserError(400, "Say something first.");
  if (command.length > MAX_COMMAND_CHARS) throw new UserError(400, "That command is too long. Try a shorter one.");

  const selected = graph.nodes.filter((n) => selection.includes(n.id));
  const selectionLine = selected.length
    ? `Selected nodes: ${selected.map((n) => `${n.id} (${n.label})`).join(", ")}`
    : "Selected nodes: none";
  const user = `Current diagram:\n${graph.nodes.length ? graphForPrompt(graph) : "(empty: start a new diagram)"}\n\n${selectionLine}\n\nCommand: ${command}`;

  const out = await askModel(EDIT_PROMPT, user);
  if (!out || typeof out.graph !== "object") throw new UserError(502, "The AI sent back something I couldn't read. Try again.");
  return { graph: sanitizeGraph(out.graph), summary: String(out.summary || "Updated the diagram.").trim().slice(0, 700) };
}

async function review({ graph }) {
  if (!graph.nodes.length) throw new UserError(400, "Draw something first, then I can review it.");
  const out = await askModel(REVIEW_PROMPT, `Diagram:\n${graphForPrompt(graph)}`);
  const ids = new Set(graph.nodes.map((n) => n.id));
  const findings = (Array.isArray(out.findings) ? out.findings : []).slice(0, 8).map((f) => ({
    nodeIds: (Array.isArray(f.nodeIds) ? f.nodeIds : []).filter((id) => ids.has(id)),
    severity: ["high", "medium", "low"].includes(f.severity) ? f.severity : "medium",
    title: String(f.title || "").slice(0, 80),
    detail: String(f.detail || "").slice(0, 400),
  })).filter((f) => f.title);
  return { summary: String(out.summary || "").slice(0, 300), findings };
}

async function docs({ graph }) {
  if (!graph.nodes.length) throw new UserError(400, "Draw something first, then I can document it.");
  const out = await askModel(DOCS_PROMPT, `Diagram:\n${graphForPrompt(graph)}`);
  if (typeof out.markdown !== "string" || !out.markdown.trim()) throw new UserError(502, "The AI didn't write anything. Try again.");
  return { markdown: out.markdown.trim() };
}

const MODES = { edit, review, docs };

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST." });
  if (!process.env.GROQ_API_KEY) return send(res, 500, { error: "The server has no GROQ_API_KEY set." });

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
  if (rateLimited(ip)) return send(res, 429, { error: "Too many requests. Take a breath and try again in a few minutes." });

  let body;
  try {
    body = await readBody(req);
  } catch {
    return send(res, 400, { error: "Invalid JSON body." });
  }

  const mode = MODES[body.mode] ? body.mode : "edit";
  if (JSON.stringify(body.graph ?? {}).length > MAX_GRAPH_CHARS) {
    return send(res, 400, { error: "This diagram is too big. Try starting a new one." });
  }

  try {
    const result = await MODES[mode]({
      command: String(body.command || "").trim(),
      graph: sanitizeGraph(body.graph),
      selection: Array.isArray(body.selection) ? body.selection.map(String).slice(0, 40) : [],
    });
    return send(res, 200, result);
  } catch (err) {
    if (err instanceof UserError) return send(res, err.status, { error: err.message });
    console.error(err);
    return send(res, 500, { error: "Something went wrong on the server." });
  }
}
