import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {metadataBase:new URL("https://eubatterypassport.nl"),title:{default:"EUBatteryPassport — Jouw batterij. Eén digitaal paspoort.",template:"%s | EUBatteryPassport"},description:"Van productgegevens en bewijsstukken tot het opstellen en beheren van jouw digitale batterijpaspoort. Start jouw online intake.",icons:{icon:"/favicon.svg"}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="nl"><body>{children}</body></html>;}

