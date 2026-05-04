import { NavLinks } from './NavLinks';

export function Sidebar(): React.JSX.Element {
  return (
    <aside className="hidden md:flex md:flex-col md:w-[240px] md:shrink-0 md:border-r md:border-zinc-200 md:bg-zinc-100">
      <div className="flex items-center px-5 h-14 border-b border-zinc-200">
        <span className="font-semibold text-zinc-900">Web Crawler</span>
      </div>
      <NavLinks />
    </aside>
  );
}
