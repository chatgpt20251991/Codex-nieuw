import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {metadataBase:new URL("https://eubatterypassport.nl"),title:{default:"EUBatteryPassport: Elke batterij. Eén helder paspoort.",template:"%s | EUBatteryPassport"},description:"Van batterijdata en bewijsstukken tot het opstellen en beheren van digitale batterijpaspoorten. Voor fabrikanten, importeurs en distributeurs.",icons:{icon:"/images/favicon-v6.png"}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="nl"><body><a className="skip-link" href="#main">Naar de inhoud</a>{children}</body></html>;}

