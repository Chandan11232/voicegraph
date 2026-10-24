// Small line icons (24px grid, stroke-based) for node kinds and the toolbar.
const paths = {
  client: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
  service: <><rect x="4" y="3" width="16" height="7" rx="2" /><rect x="4" y="14" width="16" height="7" rx="2" /><path d="M8 6.5h.01M8 17.5h.01" /></>,
  function: <><path d="M10 4c-2 0-3 1-3 3v2c0 1.5-1 2.5-2.5 3C6 12.5 7 13.5 7 15v2c0 2 1 3 3 3" /><path d="M14 4c2 0 3 1 3 3v2c0 1.5 1 2.5 2.5 3-1.5.5-2.5 1.5-2.5 3v2c0 2-1 3-3 3" /></>,
  database: <><ellipse cx="12" cy="5.5" rx="7" ry="2.5" /><path d="M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13" /><path d="M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" /></>,
  cache: <><path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z" /></>,
  queue: <><rect x="3" y="7" width="4" height="10" rx="1" /><rect x="10" y="7" width="4" height="10" rx="1" /><rect x="17" y="7" width="4" height="10" rx="1" /></>,
  storage: <><path d="M4 7.5 12 4l8 3.5v9L12 20l-8-3.5v-9Z" /><path d="m4 7.5 8 3.5 8-3.5M12 11v9" /></>,
  external: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 3.5 5.7 3.5 9s-1 6.3-3.5 9c-2.5-2.7-3.5-5.7-3.5-9s1-6.3 3.5-9Z" /></>,
  ai: <><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /><path d="M12 7.5 13.4 10.6 16.5 12l-3.1 1.4L12 16.5l-1.4-3.1L7.5 12l3.1-1.4L12 7.5Z" /></>,
  other: <><rect x="4" y="4" width="16" height="16" rx="4" /></>,

  undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
  redo: <><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></>,
  tidy: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  review: <><path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></>,
  docs: <><path d="M6 3h9l4 4v14H6V3Z" /><path d="M14 3v5h5M9 13h7M9 17h5" /></>,
  share: <><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" /></>,
  download: <><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
  close: <><path d="M6 6l12 12M18 6 6 18" /></>,
  mic: <><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z" /><path d="M19 11a7 7 0 0 1-14 0M12 18v3" /></>,
  send: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  chevron: <><path d="m6 9 6 6 6-6" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>,
  file: <><path d="M6 3h9l4 4v14H6V3Z" /><path d="M14 3v5h5" /></>,
};

export function Icon({ name, size = 18, className }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] || paths.other}
    </svg>
  );
}

export const KIND_LABELS = {
  client: "Client", service: "Service", function: "Function", database: "Database", cache: "Cache",
  queue: "Queue", storage: "Storage", external: "External", ai: "AI model", other: "Other",
};
