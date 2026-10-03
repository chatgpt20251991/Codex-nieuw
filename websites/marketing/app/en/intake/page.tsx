import type {Metadata} from "next";
import {IntakePage} from "@/components/pages/intake-page";
import {pageAlternates} from "@/lib/i18n";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {...{"title":"Online enquiry","description":"Tell us about your business, your batteries and the information you need.","robots":{"index":false}}, alternates: pageAlternates("/en/intake")};
export default function Page() {return <IntakePage locale="en"/>;}
