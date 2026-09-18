import type {Metadata} from "next";
import {PrivacyPage} from "@/components/pages/privacy-page";
import {pageAlternates} from "@/lib/i18n";
export const metadata: Metadata = {...{"title":"Privacy","description":"Hoe EUBatteryPassport omgaat met uw contactgegevens en online intake."}, alternates: pageAlternates("/privacy")};
export default function Page() {return <PrivacyPage locale="nl"/>;}
