import { GlobalSearch } from "@/components/global-search";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

type SiteHeaderProps = {
  title?: string;
};

export function SiteHeader({ title = "Overview" }: SiteHeaderProps) {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b bg-background/80 backdrop-blur-sm transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full min-w-0 items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1 shrink-0" />
        <Separator
          orientation="vertical"
          className="mx-2 h-4 shrink-0 data-[orientation=vertical]:self-center"
        />
        <div className="min-w-0 flex-1 md:max-w-sm">
          <GlobalSearch />
        </div>
        <h1 className="ml-auto min-w-0 max-w-[45%] shrink truncate text-base font-medium tracking-tight md:max-w-md">
          {title}
        </h1>
      </div>
    </header>
  );
}
