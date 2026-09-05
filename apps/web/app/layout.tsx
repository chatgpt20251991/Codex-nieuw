import './globals.css';import type {Metadata} from 'next';
export const metadata:Metadata={title:'EU Battery Passport — Compliance OS',description:'Battery Digital Product Passport infrastructure'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
