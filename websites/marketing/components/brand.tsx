import {localeHref, type Locale} from "@/lib/i18n";
export function Brand({locale = "nl"}: {locale?: Locale}) {
  return <a className="brand" href={localeHref(locale, "/")} aria-label="EUbatterypassport.nl homepage">
    <img className="brand-prefix" src="/images/prefix-v7.png" width="605" height="242" alt="" aria-hidden="true" />
    <img className="brand-wordmark" src="/images/wordmark-v7.svg" width="1046" height="112" alt="" aria-hidden="true" />
  </a>;
}
