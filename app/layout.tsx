import type { Metadata, Viewport } from 'next';
import { Boldonse } from 'next/font/google';
import './globals.css';
import ClientLayout from './ClientLayout';

const boldonse = Boldonse({
  subsets: ['latin'],
  variable: '--font-boldonse',
  display: 'swap',
  weight: '400',
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: 'Zip It',
  description: 'Your smart packing list',
  appleWebApp: {
    capable: true,
    title: 'Zip It',
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
  icons: {
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#0ea5e9',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={boldonse.variable}>
      <body className="bg-gray-50 text-gray-900">
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
