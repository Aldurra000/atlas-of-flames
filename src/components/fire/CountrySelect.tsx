import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { useFire } from "@/lib/fire/store";
import { countryNames } from "@/lib/fire/geo";

export function CountrySelect() {
  const country = useFire((s) => s.country);
  const set = useFire((s) => s.set);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const names = useMemo(() => countryNames(), []);
  const matches = names.filter((n) => n.toLowerCase().includes(q.toLowerCase())).slice(0, 12);
  return (
    <div className="relative w-full md:w-64">
      <div className="flex items-center gap-2 rounded-md border border-input bg-background px-2 py-1.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          aria-label="Search country"
          value={open ? q : (country ?? q)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search country…"
          className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
        {country && (
          <button aria-label="Clear country" onClick={() => set({ country: null })}>
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>
      {open && (
        <ul className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-xl">
          {matches.map((n) => (
            <li key={n}>
              <button
                onMouseDown={() => {
                  set({ country: n, selection: null });
                  setQ("");
                  setOpen(false);
                }}
                className="w-full px-3 py-1.5 text-left text-xs hover:bg-muted"
              >
                {n}
              </button>
            </li>
          ))}
          {!matches.length && <li className="px-3 py-1.5 text-xs text-muted-foreground">No match</li>}
        </ul>
      )}
    </div>
  );
}
