import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3002';

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: 'Orator — Neural Speech Analysis',
    template: '%s — Orator',
  },
  description:
    'AI-powered speech analysis using fMRI-based neural engagement predictions. Find exactly where audience attention drops — and why.',
  applicationName: 'Orator',
  // Invite-only product — keep it out of search indexes.
  robots: { index: false, follow: false },
  openGraph: {
    title: 'Orator — Neural Speech Analysis',
    description:
      'AI-powered speech analysis using fMRI-based neural engagement predictions.',
    siteName: 'Orator',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#09090b',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-zinc-950 text-white antialiased">{children}</body>
    </html>
  );
}
