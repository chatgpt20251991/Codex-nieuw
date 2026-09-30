import {localeHref, translate, type Locale} from "@/lib/i18n";

const starPoints = "0,-3.6 1.06,-1.46 3.42,-1.11 1.71,.56 2.12,2.91 0,1.8 -2.12,2.91 -1.71,.56 -3.42,-1.11 -1.06,-1.46";

export function Brand({locale = "nl", inverse = false}: {locale?: Locale; inverse?: boolean}) {
  return <a className={`ebp-brand${inverse ? " ebp-brand--inverse" : ""}`} href={localeHref(locale, "/")} aria-label="EUBatteryPassport.nl homepage">
    <svg className="ebp-brand-art" viewBox="0 0 464 122" width="464" height="122" aria-hidden="true" focusable="false">
      <path className="ebp-brand-banner" d="M0 0h84v116H0z" />
      <path d="M82 0h2v116h-2z" fill="#227abb" opacity=".4" />
      {Array.from({length: 12}, (_, index) => {
        const angle = (index * 30 - 90) * Math.PI / 180;
        return <polygon key={index} points={starPoints} transform={`translate(${42 + Math.cos(angle) * 29} ${49 + Math.sin(angle) * 29})`} fill="#ffdc4a" />;
      })}
      <g stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M38 40v-5h10v5M32 40h22v42H30V42a2 2 0 0 1 2-2Z" fill="none" />
        <path d="m37 52 12-5v14l-12 6Z" fill="none" />
        <path d="m39 62 7-10" />
        <path d="M32 88c-1-16 9-23 27-23-2 15-11 24-27 23Z" fill="#5baf4f" />
        <path d="M31 89c5-7 12-13 21-19" fill="none" />
      </g>
      <text className="ebp-brand-name" x="101" y="62" fontFamily="Manrope,Arial,Helvetica,sans-serif" fontSize="36" fontWeight="800" letterSpacing="-1.1"><tspan className="ebp-brand-eu">EU</tspan><tspan>BatteryPassport.nl</tspan></text>
      <text className="ebp-brand-tagline" x="102" y="88" fontFamily="Manrope,Arial,Helvetica,sans-serif" fontSize="17" fontWeight="400" letterSpacing="-.15">{translate(locale, "Gegevens. Onderbouwing. Continuïteit.")}</text>
    </svg>
  </a>;
}
