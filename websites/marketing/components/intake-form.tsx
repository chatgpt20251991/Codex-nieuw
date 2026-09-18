"use client";
import { translate, localeHref, type Locale } from "@/lib/i18n";
import { useState, useRef } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
export function IntakeForm({ locale = "nl" }: {
    locale?: Locale;
}) {
    const t = (text: string) => translate(locale, text);
    const [busy, setBusy] = useState(false), [error, setError] = useState(""), [reference, setReference] = useState("");
    const requestId = useRef<string | null>(null);
    async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); if (busy)
        return; setBusy(true); setError(""); const form = new FormData(event.currentTarget); requestId.current ??= crypto.randomUUID(); try {
        const response = await fetch("/api/intake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company: form.get("company"), email: form.get("email"), application: form.get("application"), message: form.get("message"), website: form.get("website"), requestId: requestId.current }) });
        const data = await response.json() as {
            error?: string;
            reference?: string;
        };
        if (!response.ok)
            throw new Error(data.error || t("Versturen is niet gelukt. Probeer het later opnieuw."));
        if (!data.reference)
            throw new Error(t("Geen bevestiging ontvangen. Probeer het opnieuw."));
        setReference(data.reference);
    }
    catch (e) {
        setError(e instanceof Error ? e.message : t("Versturen is niet gelukt. Uw gegevens blijven in het formulier staan."));
    }
    finally {
        setBusy(false);
    } }
    if (reference)
        return <section className="intake-form" role="status"><CheckCircle2 size={45} color="#85ecac"/><h2 style={{ margin: 0 }}>{t("Uw intake is ontvangen.")}</h2><p>{t("Bedankt voor uw aanvraag. We bekijken uw vraag en nemen contact met u op.")}</p><p className="form-small">{"" + t("Referentie:") + " "}<strong>{reference}</strong></p><Button asChild className="glow-button"><a href={localeHref(locale, "/")}>{"" + t("Terug naar de website") + " "}<ArrowRight /></a></Button></section>;
    return <form className="intake-form" onSubmit={submit} aria-busy={busy}>
 <div className="form-field"><label htmlFor="company">{t("Bedrijfsnaam")}</label><Input id="company" name="company" autoComplete="organization" required minLength={2} maxLength={160} placeholder={t("Uw bedrijfsnaam")}/></div>
 <div className="form-field"><label htmlFor="email">{t("Zakelijk e-mailadres")}</label><Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder={t("naam@bedrijf.nl")}/></div>
 <div className="form-field"><label htmlFor="application">{t("Waar worden de batterijen voor gebruikt?")}</label><NativeSelect id="application" name="application" required defaultValue=""><NativeSelectOption value="" disabled>{t("Kies een toepassing")}</NativeSelectOption>{["Elektrische voertuigen","Energieopslag","Industriële toepassingen","Lichte vervoermiddelen","Andere toepassing","Nog onbekend"].map(x => <NativeSelectOption key={x} value={x}>{t(x)}</NativeSelectOption>)}</NativeSelect></div>
 <div className="form-field"><label htmlFor="message">{"" + t("Waar kunnen we u mee helpen?") + " "}<span className="form-small">{t("(optioneel)")}</span></label><Textarea id="message" name="message" maxLength={3000} placeholder={t("Vertel kort over uw vraag en de informatie die u al heeft.")}/></div>
 <div className="honeypot" aria-hidden="true"><label htmlFor="website">{t("Laat dit veld leeg")}</label><Input id="website" name="website" tabIndex={-1} autoComplete="off"/></div>
 <p className="form-small">{"" + t("We gebruiken uw gegevens om uw aanvraag te behandelen. Lees onze") + " "}<a href={localeHref(locale, "/privacy")}>{t("privacyverklaring")}</a>{t(". Deel hier geen vertrouwelijke documenten of bijzondere persoonsgegevens.")}</p>
 {error && <p role="alert" className="form-status error">{t(error)}</p>}
 <Button type="submit" className="glow-button" disabled={busy}>{busy ? t("Bezig met versturen\u2026") : t("Verstuur intake")}<ArrowRight size={20}/></Button>
 </form>;
}
