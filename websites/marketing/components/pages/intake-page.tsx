import { translate, localeHref, type Locale } from "@/lib/i18n";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { IntakeForm } from "@/components/intake-form";
import { env } from "cloudflare:workers";
import { intakeDb } from "@/lib/intake-db";
import { workerReady } from "@/lib/intake-delivery";
export async function IntakePage({ locale = "nl" }: {
    locale?: Locale;
}) {
    const t = (text: string) => translate(locale, text);
    const configuration = env as unknown as Record<string, string | undefined>;
    let enabled = false;
    if (configuration.INTAKE_ENABLED === "true" && configuration.INTAKE_WORKER_ENABLED === "true" && configuration.RATE_LIMIT_SALT && configuration.INTAKE_WORKER_TOKEN_SHA256) {
        try {
            enabled = await workerReady(intakeDb());
        }
        catch {
            enabled = false;
        }
    }
    return <><SiteHeader locale={locale}/><main id="main" className="shell content-page intake-grid"><section className="intake-copy"><a href={localeHref(locale, "/")} className="back-link"><ArrowLeft size={17}/>{t("Terug naar de website")}</a><p className="eyebrow green-word">{t("Zet de volgende stap")}</p><h1>{t("Vertel ons")}<br />{t("waar u staat.")}</h1><p>{t("Over uw bedrijf. Uw batterijen. En de informatie die u al heeft. Zo krijgen we een goed beeld van uw vraag.")}</p><h2>{t("Nog niet alles bekend?")}</h2><p>{t("Dat is geen probleem. Begin met wat u weet en geef aan waar u hulp bij zoekt.")}</p></section>{enabled ? <IntakeForm locale={locale}/> : <section className="intake-form"><p className="eyebrow">{t("Online intake")}</p><h2 style={{ margin: 0 }}>{t("Neem contact met ons op.")}</h2><p>{"" + t("Het formulier is op dit moment niet beschikbaar. Stuur uw vraag naar") + " "}<a href="mailto:info@eubatterypassport.nl">info@eubatterypassport.nl</a>.</p><a className="back-link" href={localeHref(locale, "/")}>{"" + t("Terug naar de website") + " "}<ArrowLeft size={17}/></a></section>}</main><SiteFooter locale={locale}/></>;
}
