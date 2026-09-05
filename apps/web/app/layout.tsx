import './globals.css';
import type { Metadata } from 'next';
import { headers } from 'next/headers';

export const metadata: Metadata = {
  title: 'EU Battery Passport — Compliance OS',
  description: 'Battery Digital Product Passport infrastructure',
};

// A document nonce belongs to one response. Static HTML or ISR would reuse it.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce');
  if (!nonce || !/^[A-Za-z0-9+/]{43}=$/.test(nonce)) {
    throw new Error('A fresh middleware nonce is required to render the application');
  }
  return <html lang="en"><body>{children}</body></html>;
}
