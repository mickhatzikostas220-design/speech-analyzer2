import type { Metadata } from 'next';
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
    'AI-powered speech analysis using fMRI-based neural engagement predictions. Upload a speech and see exactly where audience attention drops — and why.',
  applicationName: 'Orator',
  openGraph: {
    title: 'Orator — Neural Speech Analysis',
    description:
      'AI-powered speech analysis using fMRI-based neural engagement predictions.',
    url: appUrl,
    siteName: 'Orator',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Orator — Neural Speech Analysis',
    description:
      'AI-powered speech analysis using fMRI-based neural engagement predictions.',
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-zinc-950 text-white antialiased">{children}</body>
    </html>
  );
}
