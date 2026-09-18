import type {Metadata} from "next";
import {headers} from "next/headers";
import {translate} from "@/lib/i18n";
import "./globals.css";
export const metadata: Metadata = {metadataBase: new URL("https://eubatterypassport.nl"), title: {default: "EUBatteryPassport", template: "%s | EUBatteryPassport"}, icons: {icon: "/images/favicon-v6.png"}};
export default async function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
 const locale = (await headers()).get("x-site-locale") === "en" ? "en" : "nl";
 return <html lang={locale}><body><a className="skip-link" href="#main">{translate(locale,"Naar de inhoud")}</a>{children}</body></html>;
}
