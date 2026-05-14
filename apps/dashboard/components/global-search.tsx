"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2Icon,
  KeyRoundIcon,
  SearchIcon,
  UsersIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useGlobalSearch } from "@/hooks/use-global-search";

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { results, isLoading, error } = useGlobalSearch(query);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const navigate = (path: string) => {
    setOpen(false);
    setQuery("");
    router.push(path);
  };

  const showMacHint =
    typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent);

  const empty =
    query.length < 2
      ? "Type at least 2 characters to search."
      : isLoading
        ? "Searching…"
        : error
          ? error
          : !results
              || (results.tenants.length === 0
                && results.licenses.length === 0
                && results.owners.length === 0)
            ? "No results found."
            : null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="relative h-9 w-full max-w-full justify-start text-muted-foreground sm:max-w-sm md:w-64"
        onClick={() => setOpen(true)}
        aria-label="Open search"
      >
        <SearchIcon className="mr-2 h-4 w-4 shrink-0" />
        <span className="truncate">Search…</span>
        <kbd className="pointer-events-none absolute right-2 hidden select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-xs font-medium opacity-100 sm:inline-flex">
          {showMacHint ? <span className="text-xs">⌘</span> : <span className="text-xs">Ctrl</span>}
          <span className="text-xs">K</span>
        </kbd>
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
        title="Search"
        description="Search tenants, licenses, and team members"
        showCloseButton={false}
      >
        <Command shouldFilter={false} loop>
          <CommandInput
            placeholder="Search tenants, licenses, owners…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {empty ? <CommandEmpty>{empty}</CommandEmpty> : null}
            {results && !empty ? (
              <>
                {results.tenants.length > 0 ? (
                  <CommandGroup heading="Tenants">
                    {results.tenants.map((t) => (
                      <CommandItem
                        key={t.id}
                        value={`tenant-${t.slug}-${t.id}`}
                        onSelect={() => navigate(`/tenants/${t.id}`)}
                      >
                        <Building2Icon className="mr-2 h-4 w-4 shrink-0" />
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate">{t.name}</span>
                          <span className="truncate text-xs text-muted-foreground">{t.adminEmail}</span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}

                {results.licenses.length > 0 ? (
                  <>
                    {results.tenants.length > 0 ? <CommandSeparator /> : null}
                    <CommandGroup heading="Licenses">
                      {results.licenses.map((l) => (
                        <CommandItem
                          key={l.id}
                          value={`license-${l.licenseKey}`}
                          onSelect={() => navigate(`/licenses/${l.id}`)}
                        >
                          <KeyRoundIcon className="mr-2 h-4 w-4 shrink-0" />
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate font-mono text-xs">{l.licenseKey}</span>
                            <span className="truncate text-xs text-muted-foreground">
                              {l.planSlug}
                              {l.tenantSlug ? ` · ${l.tenantSlug}` : " · Unassigned"}
                            </span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                ) : null}

                {results.owners.length > 0 ? (
                  <>
                    {results.tenants.length > 0 || results.licenses.length > 0 ? (
                      <CommandSeparator />
                    ) : null}
                    <CommandGroup heading="Team members">
                      {results.owners.map((o) => (
                        <CommandItem
                          key={o.id}
                          value={`owner-${o.email}`}
                          onSelect={() => navigate("/owners")}
                        >
                          <UsersIcon className="mr-2 h-4 w-4 shrink-0" />
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate">{o.name}</span>
                            <span className="truncate text-xs text-muted-foreground">{o.email}</span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                ) : null}
              </>
            ) : null}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
