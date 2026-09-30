import {Mail, ArrowUpRight} from "lucide-react";
import {Brand} from "@/components/brand";
import {translate, localeHref, type Locale} from "@/lib/i18n";

export function SiteFooter({locale = "nl"}: {locale?: Locale}) {
  const t = (text: string) => translate(locale, text);
  return <footer className="ebp-footer">
    <div className="v12-shell ebp-footer-inner">
      <div className="ebp-footer-identity"><Brand locale={locale} inverse/><p>{t("Onafhankelijke dienstverlening")}</p></div>
      <nav className="ebp-footer-navigation" aria-label={t("Footernavigatie")}>
        <a href={localeHref(locale, "/#aanpak")}>{t("Onze aanpak")}</a>
        <a href={localeHref(locale, "/voorbeeld")}>{t("Voorbeeld")}</a>
        <a href={localeHref(locale, "/privacy")}>Privacy</a>
      </nav>
      <a className="ebp-footer-email" href="mailto:info@eubatterypassport.nl"><Mail size={20} aria-hidden="true"/><span>info@eubatterypassport.nl</span><ArrowUpRight size={16} aria-hidden="true"/></a>
    </div>
    <div className="v12-shell ebp-footer-bottom"><small>© {new Date().getFullYear()} EUBatteryPassport.nl</small><span>{t("Voor fabrikanten, importeurs en distributeurs.")}</span></div>
  </footer>;
}
