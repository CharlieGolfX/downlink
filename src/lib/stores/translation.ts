import { writable } from "svelte/store";

export interface TranslationSettings {
  enabled: boolean;
  sourceLang: string;
  targetLang: string;
}

const STORAGE_KEY = "downlink-translation-settings";

const defaults: TranslationSettings = {
  enabled: false,
  sourceLang: "auto",
  targetLang: "en",
};

function load(): TranslationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...defaults };
}

function persist(settings: TranslationSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export const translationSettings = writable<TranslationSettings>(load());
translationSettings.subscribe(persist);

export const LANGUAGES: { code: string; name: string }[] = [
  { code: "auto", name: "Auto-detect" },
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "ru", name: "Russian" },
  { code: "zh", name: "Chinese" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "ar", name: "Arabic" },
  { code: "hi", name: "Hindi" },
  { code: "nl", name: "Dutch" },
  { code: "sv", name: "Swedish" },
  { code: "no", name: "Norwegian" },
  { code: "da", name: "Danish" },
  { code: "fi", name: "Finnish" },
  { code: "pl", name: "Polish" },
  { code: "tr", name: "Turkish" },
  { code: "uk", name: "Ukrainian" },
  { code: "cs", name: "Czech" },
  { code: "th", name: "Thai" },
  { code: "vi", name: "Vietnamese" },
  { code: "id", name: "Indonesian" },
  { code: "el", name: "Greek" },
  { code: "ro", name: "Romanian" },
  { code: "hu", name: "Hungarian" },
];

export const TARGET_LANGUAGES = LANGUAGES.filter((l) => l.code !== "auto");
