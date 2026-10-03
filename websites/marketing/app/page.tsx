import type {Metadata} from "next";
import {HomePage} from "@/components/pages/home-page";
import {pageAlternates} from "@/lib/i18n";
export const metadata: Metadata = {title:{absolute:"EUBatteryPassport: Elke batterij. Eén helder paspoort."},description:"Van batterijdata en bewijsstukken tot het opstellen en beheren van digitale batterijpaspoorten. Voor fabrikanten, importeurs en distributeurs.",alternates:pageAlternates("/")};
export default function Page() {return <HomePage locale="nl"/>;}
