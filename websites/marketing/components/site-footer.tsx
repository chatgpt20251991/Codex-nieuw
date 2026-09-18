import {Brand} from "@/components/brand";
import {localeHref, type Locale} from "@/lib/i18n";
export function SiteFooter({locale = "nl"}: {locale?: Locale}) {
  return <footer className="site-footer shell"><Brand locale={locale}/><div><a href="mailto:info@eubatterypassport.nl">info@eubatterypassport.nl</a><a href={localeHref(locale, "/privacy")}>Privacy</a></div><small>© {new Date().getFullYear()} EUBatteryPassport</small></footer>;
}
