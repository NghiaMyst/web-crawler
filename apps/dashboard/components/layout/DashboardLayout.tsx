import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { SignalRProvider } from '@/contexts/signalr.context';
import { Toaster } from '@/components/ui/sonner';

export function DashboardLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <SignalRProvider>
      <div className="min-h-screen flex flex-col md:flex-row bg-background">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <MobileNav />
          <main className="flex-1 px-4 md:px-8 py-6 md:py-8">
            {children}
          </main>
        </div>
        <Toaster position="bottom-right" />
      </div>
    </SignalRProvider>
  );
}
