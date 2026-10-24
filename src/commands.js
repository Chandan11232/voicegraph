// Voice commands handled in the browser, instantly, with no AI call.
// Each entry maps a spoken phrase to an action name the workspace knows how to run.
const LOCAL = [
  { action: "undoMany", pattern: /^(please )?undo( that| it| the last)? (\d+|two|three|four|five|six|seven|eight|nine|ten)( (changes|times|steps))?$/, parse: (m) => m[3] },
  { action: "undo", pattern: /^(actually,? |ok(ay)?,? |please )*(undo|go back|revert)( that| it| the last (change|one|step))?( please)?$/ },
  { action: "redo", pattern: /^(please )?redo( that| it)?( please)?$/ },
  { action: "clear", pattern: /^(let'?s )?(start over|start again|clear( the)?( diagram| canvas| everything)?|blank canvas)$/ },
  { action: "tidy", pattern: /^(please )?(tidy( it)? up|clean( it)? up|auto[- ]?layout|re-?arrange( it| everything)?|arrange( it| everything)?|organi[sz]e( it| everything)?|lay ?it out)( please)?$/ },
  { action: "fit", pattern: /^(zoom to fit|fit( to)?( the)? screen|fit( it| everything)?|show( me)? everything|center( it)?)$/ },
  { action: "zoomTo", pattern: /^(please )?(zoom|set( the)? zoom( level)?|scale)( in| out)?( to| into| at)? (\d{1,3})( ?%| percent)?( please)?$/, arg: 7 },
  { action: "zoomTo", pattern: /^(please )?(reset( the)? zoom|actual size|normal size)$/, value: 100 },
  { action: "zoomIn", pattern: /^(please )?(zoom in|closer|get closer)( a (bit|little|lot))?( more)?( please)?$/ },
  { action: "zoomOut", pattern: /^(please )?(zoom out|further out)( a (bit|little|lot))?( more)?( please)?$/ },
  { action: "newDoc", pattern: /^(please )?((create|make|start|open) )?(a )?(new|fresh|blank) (diagram|board|canvas)( (called|named|for) (.+))?$/, parse: (m) => m[9] || "" },
  { action: "sampleDoc", pattern: /^(please )?(open|load|show me)( the| a)?( fresh)? sample( diagram)?$/ },
  { action: "renameDoc", pattern: /^(please )?(rename|call|name) (this|the|my) (diagram|board|canvas|project)( to| as)? (.+)$/, parse: (m) => m[6] },
  { action: "openDoc", pattern: /^(please )?(open|switch to|go back to|go to|show me) (the |my )?(.+?) (diagram|board|canvas)$/, parse: (m) => m[4] },
  { action: "move", pattern: /^(please )?(move|nudge|shift|push|drag) (.+?) (to the |towards the )?(left|right|up|down|higher|lower)( (a )?(tiny bit|bit|little|lot|way))?( please)?$/, parse: (m) => ({ target: m[3], dir: m[5], amount: m[8] || "" }) },
  { action: "select", pattern: /^(please )?(select|highlight|pick|choose) (.+)$/, parse: (m) => m[3] },
  { action: "fix", pattern: /^(please )?(fix|apply|resolve|address|solve)( all( of)?)? (it|them|those|these|that|everything|all|the (issues|problems|findings|suggestions|review|fixes)|the (first|second|third|fourth|fifth|sixth|1st|2nd|3rd|4th|5th|6th|last|top) (one|issue|problem|finding|suggestion)|(issue|finding|number|suggestion) (\d))( for me)?( please)?$/, parse: (m) => m[7] || m[10] || null },
  { action: "speakOn", pattern: /^(please )?(read( replies| answers| it| them)?( out)? aloud|turn on (read(ing)? aloud|voice( replies)?|speech)|talk (to me|back))$/ },
  { action: "speakOff", pattern: /^(stop( reading( aloud)?| talking| speaking)?|be quiet|quiet|shush|mute|turn off (read(ing)? aloud|voice( replies)?|speech))$/ },
  { action: "focus", pattern: /^(please )?(zoom( in)? (to|on|into)|focus on|show me|go to|jump to|find|where is|where's)( the)? (.+?)\??$/, arg: 6 },
  { action: "png", pattern: /\b(download|export|save)\b.*\b(png|image|picture)\b/ },
  { action: "svg", pattern: /\b(download|export|save)\b.*\bsvg\b/ },
  { action: "mermaid", pattern: /^(please )?copy( the)? (code|mermaid|diagram)|copy (it )?for (the |my )?readme/ },
  { action: "share", pattern: /^(please )?(share( it| this| the diagram)?|copy( the)? (share )?link|get( a)? (share )?link)$/ },
  { action: "review", pattern: /^(please )?(review|check|audit|critique)( my| the| this)?( architecture| diagram| system| design)?( please)?$/ },
  { action: "docs", pattern: /^(please )?(write|generate|draft|make)( me)?( the| a| my)? (readme|docs|documentation|architecture section)( section)?( please)?$/ },
  { action: "delete", pattern: /^(please )?(delete|remove) (this|these|that|those|it|them|the selected( ones?| nodes?| boxes?)?)$/ },
  { action: "deselect", pattern: /^(deselect|clear( the)? selection|unselect)( all| everything)?$/ },
];

// Returns { action, arg } or null. Some commands carry a value ("zoom to 150%", "move Redis left").
export function matchLocalCommand(text) {
  const normalized = text.toLowerCase().replace(/[.!?]+$/g, "").replace(/\s+/g, " ").trim();
  for (const c of LOCAL) {
    const m = normalized.match(c.pattern);
    if (m) return { action: c.action, arg: c.parse ? c.parse(m) : c.arg ? m[c.arg] : c.value ?? null };
  }
  return null;
}

export const SUGGESTIONS_EMPTY = [
  "A React app talks to a Node API, and the API stores orders in Postgres",
  "Users upload photos to S3, a Lambda makes thumbnails, and saves them to DynamoDB",
  "A chatbot that calls an LLM and searches a vector database",
];

export const SUGGESTIONS_SAMPLE = [
  "Remove the direct query from the storefront to the database",
  "Put a queue between the API and Receipts, and make it dashed",
  "Add a Redis cache in front of Orders DB",
  "Group the API and the database into Backend",
];

export const SUGGESTIONS_GENERIC = [
  "What happens if the database goes down?",
  "Add an auth service in front of the API",
  "Select all databases",
  "Make it top to bottom",
];

export const SUGGESTIONS_AFTER_REVIEW = [
  "Fix them",
  "Fix the first one",
  "Why is that a problem?",
];

export const EVERYTHING_YOU_CAN_SAY = [
  {
    title: "Build",
    items: [
      "“A mobile app calls a Go API that writes to MongoDB”",
      "“Add a Kafka queue between the API and the worker”",
      "“Put Redis between the API and the database”",
      "“Connect the worker to S3”",
    ],
  },
  {
    title: "Change",
    items: [
      "“Rename Orders API to Checkout Service”",
      "“Make the payment arrow dashed and label it async”",
      "“Group the API and cache into Backend”",
      "“Make it top to bottom”, “Make Postgres red”",
    ],
  },
  {
    title: "Ask about it",
    items: [
      "“What happens if Redis goes down?”",
      "“Why is the queue there?”",
      "“How does a request reach the database?”",
      "“Explain this diagram”",
    ],
  },
  {
    title: "Select and move",
    items: [
      "“Select all databases”, “Select the API and Redis”",
      "“Select everything”, then “make these purple”",
      "“Move Redis to the left”, “Move this down a bit”",
      "“Delete this”, “Deselect”",
    ],
  },
  {
    title: "Review and fix",
    items: ["“Review my architecture”", "“Fix them” (applies every finding)", "“Fix the second one”", "“Write the README section”"],
  },
  {
    title: "Navigate",
    items: ["“Zoom in”, “Zoom out”, “Zoom to 150%”", "“Zoom to Orders API”, “Where is Stripe?”", "“Fit to screen”, “Tidy up”", "“Undo”, “Undo 3 times”, “Redo”"],
  },
  {
    title: "Diagrams",
    items: ["“New diagram called Chat app”", "“Open the online store diagram”", "“Rename this diagram to Checkout v2”", "“Open the sample”, “Start over”"],
  },
  {
    title: "Ship it",
    items: ["“Download PNG”, “Download SVG”", "“Copy for README”", "“Share it”"],
  },
  {
    title: "Voice replies",
    items: ["“Read replies aloud”", "“Stop talking”", "Or just type and press Enter"],
  },
];
