import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3002';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'Orator — Neural Speech Analysis',
    template: '%s — Orator',
  },
  description:
    'AI-powered speech analysis using neural engagement predictions. Upload a speech and see exactly where audience attention drops, and why.',
  applicationName: 'Orator',
  openGraph: {
    title: 'Orator — Neural Speech Analysis',
    description:
      'AI-powered speech analysis using neural engagement predictions.',
    url: APP_URL,
    siteName: 'Orator',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Orator — Neural Speech Analysis',
    description:
      'AI-powered speech analysis using neural engagement predictions.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#09090b',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-zinc-950 text-white antialiased">{children}</body>
    </html>
  );
}
