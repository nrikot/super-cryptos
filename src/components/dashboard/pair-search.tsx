import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fetchExchangeInfo } from "@/lib/market/api";
import { displayPair, quoteLabel } from "@/lib/market/symbols";
import { usePrefsStore } from "@/lib/stores/prefs-store";

export function PairSearch() {
  const provider = usePrefsStore((s) => s.provider);
  const add = usePrefsStore((s) => s.addToWatchlist);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const info = useQuery({
    queryKey: ["exchange-info", provider],
    queryFn: () => fetchExchangeInfo({ data: { provider } }),
    staleTime: 60 * 60 * 1000,
  });

  const results = useMemo(() => {
    const list = info.data ?? [];
    const needle = q.trim().toUpperCase().replace(/[-/]/g, "");
    if (!needle) return list.slice(0, 12);
    return list
      .filter(
        (s) =>
          s.symbol.includes(needle) ||
          s.baseAsset.includes(needle),
      )
      .slice(0, 20);
  }, [info.data, q]);

  const quote = quoteLabel(provider);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="min-w-11 gap-2">
          <Search className="size-4" />
          <span className="hidden sm:inline">Search pairs</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="p-4">
        <DialogHeader>
          <DialogTitle>Pin a pair</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          placeholder="BTC, ETH, SOL…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
          {info.isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading symbols…</p>
          ) : info.isError ? (
            <p className="p-4 text-sm text-sell">
              Could not load exchange symbols. Try the other venue.
            </p>
          ) : results.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No matches.</p>
          ) : (
            <ul>
              {results.map((s) => (
                <li key={s.symbol}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-secondary"
                    onClick={() => {
                      add(s.symbol);
                      setOpen(false);
                      setQ("");
                    }}
                  >
                    <span className="font-medium">
                      {displayPair(s.symbol, quote)}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {s.baseAsset}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
