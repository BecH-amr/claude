"use client";

import { useI18n, type Locale } from "@/lib/i18n";

const labels: Record<Locale, string> = { en: "EN", fr: "FR", ar: "ع" };

export default function LocaleSwitcher() {
  const { locale, setLocale } = useI18n();
  return (
    <div
      role="group"
      aria-label="Language"
      className="inline-flex rounded-xl border border-line bg-cream-raised p-0.5 text-xs"
    >
      {(Object.keys(labels) as Locale[]).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          aria-pressed={locale === l}
          className={`px-2.5 py-1 rounded-lg transition-colors ${
            locale === l ? "bg-coral text-cream" : "text-ink-muted hover:text-ink"
          }`}
        >
          {labels[l]}
        </button>
      ))}
    </div>
  );
}
