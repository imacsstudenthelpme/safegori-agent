const paths = {
  collapse: <><path d="M4 3h16v18H4zM9 3v18m7-13-3 4 3 4"/></>,
  expand: <><path d="M4 3h16v18H4zM9 3v18m4-13 3 4-3 4"/></>,
  copy: <><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></>,
  stop: <rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" stroke="none"/>,
  graph: <><circle cx="5" cy="7" r="3"/><circle cx="19" cy="5" r="3"/><circle cx="14" cy="19" r="3"/><path d="m8 7 8-2M7 10l5 6m6-8-3 8"/></>,
  document: <><path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7m-7 4h5"/></>,
  equipment: <><path d="M3 21h18M6 21V4h3v17M9 5h11v4H9m8 0v6m-2 0a2 2 0 1 0 4 0"/></>,
  shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/></>,
  experiment: <><path d="M9 3h6m-5 0v6L4 19a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2L14 9V3M8 14h8"/></>,
  settings: <><circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/></>,
  arrow: <path d="M12 19V5m-6 6 6-6 6 6"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  minus: <path d="M5 12h14"/>,
  fit: <path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/>,
  chat: <path d="M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5Z"/>,
};
export default function Icon({ name, size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.graph}</svg>;
}
