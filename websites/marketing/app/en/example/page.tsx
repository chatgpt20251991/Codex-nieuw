import type {Metadata} from "next";
import {ExamplePage} from "@/components/pages/example-page";
import {pageAlternates} from "@/lib/i18n";
export const metadata: Metadata = {...{"title":"Explore the example battery passport","description":"Explore how product data, provenance and supporting evidence come together in a fictional example battery passport."}, alternates: pageAlternates("/en/example")};
export default function Page() {return <ExamplePage locale="en"/>;}
