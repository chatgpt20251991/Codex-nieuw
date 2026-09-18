import type {Metadata} from "next";
import {IntakePage} from "@/components/pages/intake-page";
import {pageAlternates} from "@/lib/i18n";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {...{"title":"Online intake","description":"Vertel ons over uw bedrijf, uw batterijen en uw informatievraag.","robots":{"index":false}}, alternates: pageAlternates("/intake")};
export default function Page() {return <IntakePage locale="nl"/>;}
