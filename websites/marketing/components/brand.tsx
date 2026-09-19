import {localeHref, type Locale} from "@/lib/i18n";

export function Brand({locale = "nl"}: {locale?: Locale}) {
  return <a className="brand" href={localeHref(locale, "/")} aria-label="EUbatterypassport.nl homepage">
    <img className="brand-logo" src="/images/logo-sunburst-v9.webp" width="1800" height="208" alt="" aria-hidden="true" />
  </a>;
}
