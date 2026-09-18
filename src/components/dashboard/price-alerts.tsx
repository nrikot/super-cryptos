import { useState } from "react";
import { Bell, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/lib/format";
import { displayPair, quoteLabel } from "@/lib/market/symbols";
import { useAlertsStore } from "@/lib/stores/alerts-store";
import { useMarketStore } from "@/lib/stores/market-store";
import { usePrefsStore } from "@/lib/stores/prefs-store";
import { cn } from "@/lib/utils";

function requestPermission() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    Notification.requestPermission();
  }
}

export function PriceAlertButton() {
  const [open, setOpen] = useState(false);
  const alerts = useAlertsStore((s) => s.alerts);
  const activeCount = alerts.filter((a) => !a.triggered).length;

  return (
    <div className="relative">
      <Button
        size="sm"
        variant="ghost"
        className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
        onClick={() => setOpen(!open)}
      >
        <Bell className="size-3.5" />
        {activeCount > 0 && (
          <span className="rounded-full bg-primary/20 px-1.5 text-[10px] font-medium text-primary">
            {activeCount}
          </span>
        )}
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-xl border border-border bg-card p-3 shadow-lg sm:w-80">
          <AlertsPanel onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

function AlertsPanel({ onClose }: { onClose: () => void }) {
  const symbol = usePrefsStore((s) => s.selectedSymbol);
  const provider = usePrefsStore((s) => s.provider);
  const ticker = useMarketStore((s) => s.tickers[symbol]);
  const alerts = useAlertsStore((s) => s.alerts);
  const addAlert = useAlertsStore((s) => s.addAlert);
  const removeAlert = useAlertsStore((s) => s.removeAlert);
  const quote = quoteLabel(provider);
  const [target, setTarget] = useState("");

  const symbolAlerts = alerts.filter((a) => a.symbol === symbol);

  function handleAdd(direction: "above" | "below") {
    if (!target || Number(target) <= 0) {
      toast.error("Enter a valid target price");
      return;
    }
    requestPermission();
    addAlert(symbol, target, direction);
    toast.success(
      `Alert set: ${displayPair(symbol, quote)} ${direction} ${formatPrice(target)}`,
    );
    setTarget("");
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">
          Alerts {displayPair(symbol, quote)}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="alert-target">Target price</Label>
        <Input
          id="alert-target"
          inputMode="decimal"
          placeholder={ticker ? formatPrice(ticker.price) : "0.00"}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" onClick={() => handleAdd("above")}>
            Alert above
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleAdd("below")}>
            Alert below
          </Button>
        </div>
      </div>

      {symbolAlerts.length > 0 && (
        <div className="space-y-1.5">
          {symbolAlerts.map((a) => (
            <div
              key={a.id}
              className={cn(
                "flex items-center justify-between rounded-lg px-3 py-2 text-xs",
                a.triggered ? "bg-muted/50 text-muted-foreground" : "bg-muted/30",
              )}
            >
              <span className="font-mono tabular">
                {a.direction === "above" ? "\u25B2" : "\u25BC"}{" "}
                {formatPrice(a.targetPrice)}
                {a.triggered && " (hit)"}
              </span>
              {!a.triggered && (
                <button
                  type="button"
                  onClick={() => removeAlert(a.id)}
                  className="text-muted-foreground hover:text-sell"
                >
                  <Trash2 className="size-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {symbolAlerts.length === 0 && (
        <p className="text-center text-xs text-muted-foreground">
          No alerts for this pair.
        </p>
      )}
    </div>
  );
}
