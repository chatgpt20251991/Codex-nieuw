"use client";
import {useEffect, useRef, useState} from "react";
import {usePathname} from "next/navigation";
import {Menu, X, Mail, ArrowRight} from "lucide-react";
import {Brand} from "@/components/brand";
import {LanguageSwitch} from "@/components/language-switch";
import {translate, localeHref, type Locale} from "@/lib/i18n";

export function SiteHeader({locale = "nl"}: {locale?: Locale}) {
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  const pathname = usePathname() || "/";
  const t = (text: string) => translate(locale, text);
  const links = [["/", "Home"], ["/#batterijpaspoort", "Batterijpaspoort"], ["/#voor-wie", "Voor wie"], ["/#aanpak", "Onze aanpak"], ["/voorbeeld", "Voorbeeld"], ["/#vragen", "Veelgestelde vragen"]];

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    const handlePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !header.current?.contains(event.target)) setOpen(false);
    };
    const desktop = window.matchMedia("(min-width: 961px)");
    const handleDesktop = () => {if (desktop.matches) setOpen(false);};
    document.addEventListener("keydown", handleKey);
    document.addEventListener("pointerdown", handlePointer);
    desktop.addEventListener("change", handleDesktop);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("pointerdown", handlePointer);
      desktop.removeEventListener("change", handleDesktop);
    };
  }, [open]);

  const navLinks = links.map(([href, label]) => <a key={href} href={localeHref(locale, href)} aria-current={!href.includes("#") && pathname === localeHref(locale, href) ? "page" : undefined} onClick={() => setOpen(false)}>{t(label)}</a>);

  return <header className="ebp-header" ref={header}>
    <div className="v12-shell ebp-masthead">
      <div className="ebp-header-languages"><span lang={locale}>{locale.toUpperCase()}</span><span aria-hidden="true" className="ebp-language-divider">|</span><LanguageSwitch locale={locale}/></div>
      <Brand locale={locale}/>
      <a className="ebp-header-contact" href="mailto:info@eubatterypassport.nl"><Mail size={21} aria-hidden="true"/>{t("Contact")}</a>
    </div>
    <div className="ebp-navigation-band">
      <nav className="v12-shell ebp-desktop-navigation" aria-label={t("Hoofdnavigatie")}>{navLinks}</nav>
      <div className="v12-shell ebp-mobile-toolbar">
        <button ref={menuButton} type="button" className="ebp-menu-button" aria-label={t(open ? "Menu sluiten" : "Menu openen")} aria-expanded={open} aria-controls="ebp-mobile-navigation" onClick={() => setOpen(value => !value)}>{open ? <X size={23} aria-hidden="true"/> : <Menu size={23} aria-hidden="true"/>}<span>{t("Menu")}</span></button>
        <LanguageSwitch locale={locale}/>
      </div>
      <nav id="ebp-mobile-navigation" className="ebp-mobile-navigation" aria-label={t("Mobiele navigatie")} hidden={!open}>
        <div className="v12-shell">{navLinks}<a className="ebp-mobile-intake" href={localeHref(locale, "/intake")} onClick={() => setOpen(false)}>{t("Start online intake")}<ArrowRight size={18} aria-hidden="true"/></a><a href="mailto:info@eubatterypassport.nl" onClick={() => setOpen(false)}>{t("Contact")}<Mail size={18} aria-hidden="true"/></a></div>
      </nav>
    </div>
  </header>;
}
