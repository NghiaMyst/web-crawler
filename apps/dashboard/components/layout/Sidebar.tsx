import { NavLinks } from './NavLinks';
import { ConnectionDot } from '@/components/connection/connection-dot';
import { SearchInput } from '@/components/search/SearchInput';

export function Sidebar(): React.JSX.Element {
  return (
    <aside className="hidden md:flex md:flex-col md:w-[220px] md:shrink-0 bg-[#1c1814]">
      {/* Logo */}
      <div className="flex items-center px-5 h-14 border-b border-white/8">
        <div className="inline-flex items-center gap-2">
          <span className="font-heading font-bold text-base tracking-tight select-none">
            <span className="text-white">web</span>
            <span className="text-[#d8553a]">crawler</span>
          </span>
          <ConnectionDot />
        </div>
      </div>
      {/* Search */}
      <div className="px-3 py-2.5 border-b border-white/8">
        <SearchInput />
      </div>
      {/* Nav */}
      <NavLinks />
    </aside>
  );
}
