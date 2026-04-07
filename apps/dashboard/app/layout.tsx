import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Web Crawler Dashboard',
  description: 'Data aggregation monitoring dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
