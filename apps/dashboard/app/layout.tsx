import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { cn } from '@/lib/utils';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

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
    <html lang="en" className={cn('font-sans', geist.variable)}>
      <body className="antialiased text-zinc-900">
        <DashboardLayout>{children}</DashboardLayout>
      </body>
    </html>
  );
}
