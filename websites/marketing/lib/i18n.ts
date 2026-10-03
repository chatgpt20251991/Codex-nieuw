import english from "./translations/en.json" with {type: "json"};

export type Locale = "nl" | "en";
const englishText: Record<string, string> = english;
const routes: Record<string, string> = {
  "/": "/en",
  "/voorbeeld": "/en/example",
  "/intake": "/en/intake",
  "/privacy": "/en/privacy",
};

export function translate(locale: Locale, text: string): string {
  return locale === "en" ? englishText[text] ?? text : text;
}

export function localeHref(locale: Locale, href: string): string {
  const [pathname, hash] = href.split("#", 2);
  const canonical = Object.entries(routes).find(([, en]) => en === pathname)?.[0] ?? pathname;
  const path = locale === "en" ? routes[canonical] ?? canonical : canonical;
  return path + (hash ? `#${hash}` : "");
}

export function pageAlternates(pathname: string) {
  return {canonical: pathname, languages: {nl: localeHref("nl", pathname), en: localeHref("en", pathname), "x-default": localeHref("nl", pathname)}};
}
