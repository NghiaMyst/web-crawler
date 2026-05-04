import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';

export function DashboardLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-zinc-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileNav />
        <main className="flex-1 px-4 md:px-8 py-6 md:py-8">{children}</main>
      </div>
    </div>
  );
}
