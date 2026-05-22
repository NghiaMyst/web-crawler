import { NavLinks } from './NavLinks';
import { ConnectionDot } from '@/components/connection/connection-dot';

export function Sidebar(): React.JSX.Element {
  return (
    <aside className="hidden md:flex md:flex-col md:w-[240px] md:shrink-0 bg-zinc-900">
      <div className="flex items-center px-5 h-14 border-b border-white/10">
        <div className="inline-flex items-center gap-2">
          <span className="font-heading font-semibold text-white tracking-tight">Web Crawler</span>
          <ConnectionDot />
        </div>
      </div>
      <NavLinks />
    </aside>
  );
}
