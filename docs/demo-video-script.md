---
title: Voicegraph – Demo Video Script
project: Voicegraph
event: "No Hands: The Wispr Challenge (WeMakeDevs × Wispr Flow)"
deadline: 2026-10-31 23:59 IST
length: 5 min (full) + 2 min cut (submission)
created: 2026-10-24
tags: [voicegraph, hackathon, wispr, demo, script]
---

# Voicegraph: Demo Video Script (5 min)

> [!warning] Submission limit
> The No Hands challenge accepts a demo video of **up to 2 minutes**. Use the **full 5-minute version** for YouTube, the blog post and #NoHandsChallenge posts, and the **2-minute cut** (bottom of this note) for the submission form.

**One-line pitch:** *Say the system. Shape it by hand.* Voicegraph turns architecture you explain out loud into a diagram you can drag around, get reviewed, fix by voice and drop into your README.

---

## Before you record (checklist)

- [ ] Use the live site **https://voicegraph-mocha.vercel.app**, or the local dev server (`npm run dev` in `saydiagram/`)
- [ ] Open **https://voicegraph-mocha.vercel.app/app?sample=1** in a clean window so the flawed online-store sample is loaded
- [ ] Browser zoom at 100%, window about 1440×900, bookmarks bar hidden, notifications off (Do Not Disturb)
- [ ] Wispr Flow: mic set to **MacBook Air Microphone** (or your headset), test one dictation first
- [ ] Decide on **"Read replies aloud"**: on makes the video feel alive, but keep your own voiceover quiet while it talks
- [ ] Have a GitHub repo README open in another tab for the "paste Mermaid" moment
- [ ] Wispr Flow **Insights** screen ready for the closing shot (usage card)
- [ ] Do one full dry run. The AI phrasing changes slightly each time, so don't read its replies word for word

**Legend:** 🎙️ = say this out loud as voiceover · 🗣️ = dictate this with Wispr Flow (hold Fn, speak, let go) · 🖱️ = do this on screen

---

## 0:00 – 0:25 · Hook and the problem

🖱️ Start on the **landing page** (`/`), cursor still.

🎙️ "Every project I build needs an architecture diagram for the README, the pitch and the design doc. I can explain my system in thirty seconds, but drawing it in draw.io takes thirty minutes. Then the design changes, nobody updates the diagram, and nobody writes the architecture section."

🎙️ "So I built Voicegraph, and I built it without typing. Every prompt was dictated with Wispr Flow."

---

## 0:25 – 0:50 · What Voicegraph is

🖱️ Scroll slowly through the landing page: hero → "Speak. Shape. Then ship." → feature grid. Click **Open workspace**.

🎙️ "Voicegraph is a voice-first architecture whiteboard. You describe a system the way you'd explain it to a teammate, and it draws it. Then you can drag every box, get the design reviewed for weak spots, fix them by voice and export straight into your README."

🖱️ Workspace opens: point at the three areas as you name them.

🎙️ "On the left is the canvas. On the right is where I talk to it: the command box, things to try, and a conversation that records everything I said and what changed."

---

## 0:50 – 1:50 · Introduce the architecture, by drawing it with Voicegraph itself

🗣️ "New diagram called Voicegraph architecture"

🎙️ "The best way to explain how this works is to have Voicegraph draw itself."

🗣️ Dictate this in one go:
> "The user speaks into Wispr Flow, which types into the Voicegraph workspace, a React app using React Flow. The workspace sends the command and the current diagram to a Vercel serverless function. The function calls the gpt-oss-120b model on Groq and returns the updated diagram. ELK lays out the boxes, and the diagram is saved in the browser's local storage."

🖱️ Wait for it to draw. Hover over each box as you explain it.

🎙️ (walk through the boxes)
- "**Wispr Flow** is the input device. I hold Fn, speak, and it pastes clean text into the command box. Voicegraph notices a dictation landed and runs it automatically, with no Enter key."
- "The **workspace** is React with React Flow, the same kind of node canvas tools like n8n use. That's why it feels smooth to drag."
- "The diagram isn't a picture. It's a small **JSON graph** of boxes, kinds, technologies, colours, groups and arrows. So the AI edits structured data, not pixels."
- "The **Vercel function** has three modes: edit, review and docs. It holds the API key, forces JSON output, validates every graph that comes back, retries briefly when it's rate-limited, and rate-limits visitors."
- "The model is **gpt-oss-120b on Groq**, which comes back in about one to two seconds, so talking to it feels live."
- "**ELK** lays out the boxes. Anything I've already placed by hand stays where I put it, and only new boxes get placed."
- "Short commands like undo, zoom, select, move or download **never hit the AI**. They run instantly in the browser."

🗣️ "Group the Vercel function and Groq into a box called Backend"

🎙️ "And everything stays in your browser. No account, no database."

---

## 1:50 – 2:40 · Editing by voice

🗣️ "Open the online store diagram"

🎙️ "Here's a sample with deliberate problems. Let's work on it by voice."

🗣️ "Add a Redis cache in front of Orders DB"

🎙️ "Notice the existing boxes didn't jump around. Only the new one slotted in."

🗣️ "Select all databases"
🗣️ "Make these red"

🎙️ "It knows what I've selected, so 'this' and 'these' just work."

🗣️ "Move this to the right"
🗣️ "Zoom to Orders API"
🗣️ "Fit to screen"

🗣️ "What happens if the database goes down?"

🎙️ "Questions get answers, not edits. The diagram stays exactly as it was."

---

## 2:40 – 3:20 · Shaping it by hand

🖱️ Drag 2–3 boxes around (show the lift-and-tilt while dragging). Drag from a box's dot to another box to connect them. Double-click a box to rename it. Select a box and press Delete.

🎙️ "Voice gets the system down fast, but sometimes you just want to grab a box. Drag to move, drag from a dot to connect, double-click to rename. Groups follow their boxes."

🗣️ "Undo 2 times"

🗣️ "Tidy up"

🎙️ "And when it gets messy, 'tidy up' rearranges everything with an animation."

---

## 3:20 – 4:15 · Review → Fix → README (the "really useful" part)

🗣️ "Review my architecture"

🖱️ Point at the coloured dots on the boxes, then at the findings list. Click one finding to jump to its box.

🎙️ "It reviews the design like a senior engineer would: single points of failure, the storefront querying the database directly, emails sent while the shopper waits. Each finding is pinned to the boxes involved."

🎙️ "And I don't have to fix these by hand."

🗣️ "Fix the first one"

🎙️ "It just removed that direct database connection, so everything goes through the API now."

🗣️ "Fix them"  *(optional, for the remaining findings)*

🗣️ "Write the README section"

🖱️ Open **Preview** under the reply.

🎙️ "And it writes the architecture section for my README: overview, components and data flow, with the diagram included as Mermaid."

---

## 4:15 – 4:40 · Ship it

🗣️ "Copy for README"

🖱️ Switch to the GitHub tab → edit README → paste → **Preview**: the diagram renders natively on GitHub.

🎙️ "GitHub renders Mermaid natively, so the diagram stays editable in the repo. Not a dead screenshot."

🗣️ "Download PNG"
🗣️ "Share it"

🎙️ "I can also export a crisp PNG or SVG, or share a link. The whole diagram is compressed into the URL, so there's no server storage."

---

## 4:40 – 5:00 · How I used Wispr Flow and close

🖱️ Show the **Wispr Flow Insights** usage card.

🎙️ "I built Voicegraph entirely by voice: the spec, every prompt to my coding assistant, the debugging, even this README. Wispr Flow isn't just how I built it, it's how you use it. One bug I hit along the way: Wispr restores your clipboard right after pasting, and Chrome sometimes read it too late and dropped the text. Voicegraph now takes the text straight from the paste event, so every dictation lands."

🖱️ Back to the workspace, full diagram on screen.

🎙️ "Voicegraph. Say the system, shape it by hand. Thanks for watching."

---

## 2-minute cut (for the submission form)

| Time | Show | Say / dictate |
|---|---|---|
| 0:00–0:15 | Landing page | 🎙️ "Every project needs an architecture diagram. I can explain mine in 30 seconds, but drawing it takes 30 minutes. So I built Voicegraph, by voice, with Wispr Flow." |
| 0:15–0:40 | New diagram | 🗣️ the Voicegraph-architecture dictation from 0:50 above · 🎙️ "One sentence, one diagram. React Flow canvas, a Vercel function, gpt-oss-120b on Groq." |
| 0:40–1:05 | Sample diagram | 🗣️ "Select all databases" → "Make these red" → "Move this to the right" → drag one box by hand · 🎙️ "It knows what I selected, and boxes I placed stay put." |
| 1:05–1:35 | Review | 🗣️ "Review my architecture" → "Fix the first one" · 🎙️ "It finds weak spots and fixes them by voice." |
| 1:35–1:50 | README | 🗣️ "Write the README section" → "Copy for README" → paste into GitHub · 🎙️ "And it writes the docs, with the diagram as Mermaid." |
| 1:50–2:00 | Wispr Insights | 🎙️ "Built entirely by voice. Say the system, shape it by hand." |

---

## If something goes wrong while recording

- **Dictation didn't run** → check the hint under the command box. "Heard you. Running in a moment…" means it's coming. Otherwise click the command box once and dictate again.
- **AI misheard** → press **Esc** while "Heard you…" is showing, fix the text and press Enter, or just say "undo".
- **"The AI is busy"** → Groq rate limit. Wait 10 seconds and repeat, or cut it in editing.
- **Layout looks messy** → "Tidy up".
- **Lost the diagram off-screen** → "Fit to screen".

## Architecture cheat sheet (for questions or the blog)

- **Frontend:** Vite + React, `@xyflow/react` (React Flow) canvas, `elkjs` layered layout (lazy-loaded, about 1.4 MB, loaded only on first layout), `html-to-image` for PNG/SVG, `lz-string` share links, self-hosted fonts.
- **Data model:** JSON graph `{direction, nodes[id,label,kind,tech,color,group], edges[from,to,label,style], groups}`, validated by `shared/graph.js` (also converts to Mermaid).
- **Backend:** one Vercel function `api/command.js`, modes `edit` / `review` / `docs`, Groq JSON mode, output sanitised, retries once on short 429s, per-IP rate limit.
- **Model choice:** gpt-oss-120b (Qwen was faster, but the free tier caps it at 1,000 output tokens a minute, which broke Review and README; Groq no longer serves Llama chat models).
- **Instant commands (no AI):** undo/redo (×N), zoom, find, select, move, tidy, fit, export, share, diagram management, voice replies on/off.
- **Voice reliability:** auto-run on dictation, a queue for speech during AI work, focus always returns to the command box, and paste text taken from the event itself (fixes the Wispr clipboard-restore race).
- **Storage:** browser localStorage only. Several diagrams, no account.

## Related
- Project folder: `~/Desktop/hackathon-project/saydiagram`
- Tests: `npm run test:e2e` (dictation, paste race, voice commands)
- Submission needs: link · ≤2 min video · Wispr Insights screenshot · a few lines on problem / who / how Wispr was used
