import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAlertsStore, type PriceAlert } from "@/lib/stores/alerts-store";
import { useMarketStore } from "@/lib/stores/market-store";
import { formatPrice } from "@/lib/format";

function requestNotificationPermission() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function fireNotification(alert: PriceAlert, currentPrice: string) {
  const title = `${alert.symbol} crossed ${alert.direction} ${formatPrice(alert.targetPrice)}`;
  const body = `Current price: ${formatPrice(currentPrice)}`;

  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      new Notification(title, {
        body,
        icon: "/favicon.ico",
        tag: `alert-${alert.id}`,
      });
    } catch {
      /* notification failed silently */
    }
  }

  toast.info(title, { description: body });
}

export function usePriceAlerts() {
  const triggeredRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    const unsub = useMarketStore.subscribe((state) => {
      const alerts = useAlertsStore.getState().alerts;
      const pending = alerts.filter(
        (a) => !a.triggered && !triggeredRef.current.has(a.id),
      );
      if (pending.length === 0) return;

      for (const alert of pending) {
        const ticker = state.tickers[alert.symbol];
        if (!ticker) continue;

        const price = Number(ticker.price);
        const target = Number(alert.targetPrice);
        if (!Number.isFinite(price) || !Number.isFinite(target)) continue;

        let crossed = false;
        if (alert.direction === "above" && price >= target) crossed = true;
        if (alert.direction === "below" && price <= target) crossed = true;

        if (crossed) {
          triggeredRef.current.add(alert.id);
          useAlertsStore.getState().markTriggered(alert.id);
          fireNotification(alert, ticker.price);
        }
      }
    });
    return unsub;
  }, []);
}
