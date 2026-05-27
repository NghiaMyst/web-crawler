import { NavLinks } from './NavLinks';
import { ConnectionDot } from '@/components/connection/connection-dot';
import { SearchInput } from '@/components/search/SearchInput';

export function Sidebar(): React.JSX.Element {
  return (
    <aside className="hidden md:flex md:flex-col md:w-[220px] md:shrink-0 bg-sidebar">
      {/* Logo */}
      <div className="flex items-center px-5 h-14 border-b border-sidebar-border">
        <div className="inline-flex items-center gap-2">
          <span className="font-heading font-bold text-base tracking-tight select-none">
            <span className="text-sidebar-foreground">web</span>
            <span className="text-primary">crawler</span>
          </span>
          <ConnectionDot />
        </div>
      </div>
      {/* Search */}
      <div className="px-3 py-2.5 border-b border-sidebar-border">
        <SearchInput />
      </div>
      {/* Nav */}
      <NavLinks />
    </aside>
  );
}
