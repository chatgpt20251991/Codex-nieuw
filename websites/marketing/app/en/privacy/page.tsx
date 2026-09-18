import type {Metadata} from "next";
import {PrivacyPage} from "@/components/pages/privacy-page";
import {pageAlternates} from "@/lib/i18n";
export const metadata: Metadata = {...{"title":"Privacy","description":"How EUBatteryPassport handles your contact details and online enquiry."}, alternates: pageAlternates("/en/privacy")};
export default function Page() {return <PrivacyPage locale="en"/>;}
