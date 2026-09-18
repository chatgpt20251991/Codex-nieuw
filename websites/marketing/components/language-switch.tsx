"use client";
import {usePathname} from "next/navigation";
import {localeHref, type Locale} from "@/lib/i18n";

function Flag({locale}: {locale: Locale}) {
  return locale === "en" ? <svg className="language-flag" viewBox="0 0 60 40" aria-hidden="true">
    <rect width="60" height="40" fill="#17346b" />
    <path d="M0 0 60 40M60 0 0 40" stroke="#fff" strokeWidth="9" />
    <path d="M0 0 60 40M60 0 0 40" stroke="#c62c3c" strokeWidth="3" />
    <path d="M30 0v40M0 20h60" stroke="#fff" strokeWidth="13" />
    <path d="M30 0v40M0 20h60" stroke="#c62c3c" strokeWidth="7" />
  </svg> : <svg className="language-flag" viewBox="0 0 60 40" aria-hidden="true">
    <path fill="#ae2635" d="M0 0h60v14H0z" /><path fill="#fff" d="M0 14h60v12H0z" /><path fill="#21468b" d="M0 26h60v14H0z" />
  </svg>;
}

export function LanguageSwitch({locale}: {locale: Locale}) {
  const pathname = usePathname() || "/";
  const target = locale === "nl" ? "en" : "nl";
  const label = target === "en" ? "View this page in English" : "Bekijk deze pagina in het Nederlands";
  return <a className="language-switch" href={localeHref(target, pathname)} hrefLang={target} lang={target} aria-label={label} title={label}
    onClick={event => {if (window.location.hash) event.currentTarget.href = localeHref(target, pathname) + window.location.hash;}}>
    <Flag locale={target}/><span>{target.toUpperCase()}</span>
  </a>;
}
