"use client";
import {useState} from "react";
import {Menu, X, ArrowUpRight} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Brand} from "@/components/brand";
import {LanguageSwitch} from "@/components/language-switch";
import {translate, localeHref, type Locale} from "@/lib/i18n";

export function SiteHeader({locale = "nl"}: {locale?: Locale}) {
  const [open, setOpen] = useState(false);
  const t = (text: string) => translate(locale, text);
  const links = [["/#aanpak", "Onze aanpak"], ["/#voor-wie", "Voor wie"], ["/#vragen", "Vragen"]];
  return <header className="site-header"><div className="shell header-inner">
    <Brand locale={locale}/>
    <nav className="desktop-nav" aria-label={t("Hoofdnavigatie")}>
      {links.map(([href, label]) => <a key={href} href={localeHref(locale, href)}>{t(label)}</a>)}
    </nav>
    <Button asChild className="header-cta"><a href={localeHref(locale, "/intake")}>{t("Start online intake")} <ArrowUpRight size={19}/></a></Button>
    <LanguageSwitch locale={locale}/>
    <Button variant="ghost" size="icon" className="menu-toggle" aria-label={t(open ? "Menu sluiten" : "Menu openen")} aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen(!open)}>{open ? <X/> : <Menu/>}</Button>
  </div>{open && <nav id="mobile-nav" className="mobile-nav" aria-label={t("Mobiele navigatie")}>
    {links.map(([href, label]) => <a key={href} href={localeHref(locale, href)} onClick={() => setOpen(false)}>{t(label)}</a>)}
    <a href={localeHref(locale, "/intake")}>{t("Start online intake")}</a>
  </nav>}</header>;
}
