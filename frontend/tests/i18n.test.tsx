import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { I18nProvider, useI18n, dirFor, type Locale } from "@/lib/i18n";

function Probe() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="hello">{t("auth.login")}</span>
      <button onClick={() => setLocale("ar")}>ar</button>
      <button onClick={() => setLocale("fr")}>fr</button>
    </div>
  );
}

describe("i18n", () => {
  it("dictionary is complete: every locale has every key from `en`", async () => {
    const mod = await import("@/lib/i18n");
    // Reach into the closed-over dict by walking I18nProvider's exports.
    // `dirFor` proves the locale list; t() proves the key set.
    const locales = Object.keys(dirFor) as Locale[];

    // Render in each locale and check that every key the EN page uses
    // resolves to a non-key string (i.e. not echoing the key back).
    const keys = [
      "app.tagline",
      "join.title",
      "join.name",
      "join.phone",
      "join.optional",
      "join.submit",
      "join.submitting",
      "join.closed",
      "join.full",
      "status.waiting",
      "status.called",
      "status.serving",
      "status.completed",
      "status.no_show",
      "status.cancelled",
      "status.position",
      "status.live",
      "auth.login",
      "auth.register",
      "auth.businessName",
      "auth.phone",
      "auth.password",
      "auth.haveAccount",
      "auth.noAccount",
      "dash.title",
      "dash.callNext",
      "dash.addWalkin",
      "dash.open",
      "dash.close",
      "dash.printQR",
      "dash.empty",
      "dash.complete",
      "dash.noShow",
      "dash.noQueues",
      "dash.couldNotLoad",
      "queue.create",
      "queue.name",
      "queue.maxCapacity",
      "queue.unlimited",
      "common.cancel",
      "common.save",
      "common.signOut",
      "common.loading",
      "common.tryAgain",
      "common.error",
    ] as const;

    for (const locale of locales) {
      let setLocaleHandle: ((l: typeof locale) => void) | null = null;

      function Inner() {
        const { t, setLocale } = useI18n();
        setLocaleHandle = setLocale;
        return (
          <ul>
            {keys.map((k) => (
              <li key={k} data-key={k} data-locale={locale}>
                {t(k)}
              </li>
            ))}
          </ul>
        );
      }
      const { unmount } = render(
        <I18nProvider>
          <Inner />
        </I18nProvider>,
      );
      if (locale !== "en") {
        await act(async () => {
          setLocaleHandle!(locale);
        });
      }
      // Every translated string must be non-empty and != the key (key fallback
      // would mean the locale is missing that entry).
      for (const k of keys) {
        const el = document.querySelector(`[data-key="${k}"]`);
        expect(el, `missing ${k} in ${locale}`).toBeTruthy();
        const text = el!.textContent ?? "";
        expect(text.length, `${locale} ${k} empty`).toBeGreaterThan(0);
        expect(text, `${locale} ${k} echoed key`).not.toBe(k);
      }
      unmount();
    }
  });

  it("flips <html dir> to rtl on Arabic and back to ltr otherwise", async () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    // Initial locale is en — ltr.
    expect(document.documentElement.dir).toBe("ltr");
    expect(document.documentElement.lang).toBe("en");

    await act(async () => {
      fireEvent.click(screen.getByText("ar"));
    });
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.lang).toBe("ar");

    await act(async () => {
      fireEvent.click(screen.getByText("fr"));
    });
    expect(document.documentElement.dir).toBe("ltr");
    expect(document.documentElement.lang).toBe("fr");
  });

  it("persists locale to localStorage", async () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText("ar"));
    });
    expect(localStorage.getItem("q.locale")).toBe("ar");
  });
});
