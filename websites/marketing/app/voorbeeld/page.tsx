import type {Metadata} from "next";
import {ExamplePage} from "@/components/pages/example-page";
import {pageAlternates} from "@/lib/i18n";
export const metadata: Metadata = {...{"title":"Bekijk het voorbeeldpaspoort","description":"Bekijk hoe productgegevens, herkomst en onderbouwing samenkomen in een fictief voorbeeldpaspoort."}, alternates: pageAlternates("/voorbeeld")};
export default function Page() {return <ExamplePage locale="nl"/>;}
