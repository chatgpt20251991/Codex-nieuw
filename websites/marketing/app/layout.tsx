import type {Metadata} from "next";
import {headers} from "next/headers";
import {translate} from "@/lib/i18n";
import "./globals.css";
import "./brand-header.css";
import "./home-v12.css";
export const metadata: Metadata = {metadataBase: new URL("https://eubatterypassport.nl"), title: {default: "EUBatteryPassport", template: "%s | EUBatteryPassport"}, icons: {icon: "/images/favicon-v12.svg"}};
export default async function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
 const locale = (await headers()).get("x-site-locale") === "en" ? "en" : "nl";
 return <html lang={locale}><head><link rel="preload" href="/fonts/source-sans-3-regular.woff2" as="font" type="font/woff2" crossOrigin="anonymous"/><link rel="preload" href="/fonts/source-sans-3-semibold.woff2" as="font" type="font/woff2" crossOrigin="anonymous"/></head><body><a className="skip-link" href="#main">{translate(locale,"Naar de inhoud")}</a>{children}</body></html>;
}
