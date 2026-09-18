import type {Metadata} from "next";
import {HomePage} from "@/components/pages/home-page";
import {pageAlternates} from "@/lib/i18n";
export const metadata: Metadata = {title:{absolute:"EUBatteryPassport: Every battery. One clear passport."},description:"From battery data and supporting documents to creating and managing digital battery passports. For manufacturers, importers and distributors.",alternates:pageAlternates("/en")};
export default function Page() {return <HomePage locale="en"/>;}
