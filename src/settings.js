import { createContext, useContext, useState, useEffect } from 'react';
export const defaults = { dark: false, size: 'normal', nodeDisplay: 'both', relations: true, reading: false, sources: true };
export const SettingsContext = createContext(defaults);
export const useSettings = () => useContext(SettingsContext);
export function usePreferences() {
  const [settings, setSettings] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('safegori.preferences')) || {};
      return Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key,
        typeof value === 'boolean' ? (typeof saved[key] === 'boolean' ? saved[key] : value) :
        (key === 'size' ? ['normal', 'large', 'larger'] : ['both', 'name']).includes(saved[key]) ? saved[key] : value]));
    } catch { return defaults; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = settings.dark ? 'dark' : 'light';
    document.documentElement.dataset.textSize = settings.size;
    try { localStorage.setItem('safegori.preferences', JSON.stringify(settings)); } catch { /* Storage may be unavailable. */ }
  }, [settings]);
  return [settings, (key, value) => setSettings(previous => ({ ...previous, [key]: value }))];
}
