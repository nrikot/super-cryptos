import { getWsProvider } from "@/lib/providers";
import type { DataProviderName, Ticker, WsStatus } from "@/lib/market/types";

const PING_EVERY_MS = 3 * 60 * 1000;
const PONG_WAIT_MS = 10_000;
const HEARTBEAT_STALE_MS = 15_000;
const BACKOFF = [1000, 2000, 4000, 8000, 15000, 30000];

type StatusListener = (status: WsStatus) => void;
type TickerListener = (ticker: Ticker) => void;

export class WsManager {
  private ws: WebSocket | null = null;
  private providerName: DataProviderName;
  private symbols = new Set<string>();
  private status: WsStatus = "idle";
  private statusListeners = new Set<StatusListener>();
  private tickerListeners = new Set<TickerListener>();
  private pingTimer: number | null = null;
  private pongTimer: number | null = null;
  private staleTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private backoffIdx = 0;
  private pingId = 0;
  private lastMessageAt = 0;
  private closedByUser = false;
  private generation = 0;

  constructor(provider: DataProviderName = "coinbase") {
    this.providerName = provider;
  }

  getStatus(): WsStatus {
    return this.status;
  }

  onStatus(fn: StatusListener): () => void {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => this.statusListeners.delete(fn);
  }

  onTicker(fn: TickerListener): () => void {
    this.tickerListeners.add(fn);
    return () => this.tickerListeners.delete(fn);
  }

  setProvider(name: DataProviderName) {
    if (name === this.providerName) return;
    this.providerName = name;
    this.backoffIdx = 0;
    this.reconnectNow();
  }

  setSymbols(canonical: string[]) {
    const next = new Set(canonical.map((s) => s.toUpperCase()));
    const added: string[] = [];
    const removed: string[] = [];
    for (const s of next) if (!this.symbols.has(s)) added.push(s);
    for (const s of this.symbols) if (!next.has(s)) removed.push(s);
    this.symbols = next;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (next.size > 0 && this.status === "idle") this.connect();
      return;
    }
    const provider = getWsProvider(this.providerName);
    if (removed.length) this.ws.send(provider.unsubscribePayload(removed) ?? "");
    if (added.length) this.ws.send(provider.subscribePayload(added));
  }

  start() {
    this.closedByUser = false;
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) this.connect();
  }

  stop() {
    this.closedByUser = true;
    this.clearTimers();
    this.generation += 1;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
    }
    this.ws = null;
    this.setStatus("disconnected");
  }

  private setStatus(next: WsStatus) {
    if (this.status === next) return;
    this.status = next;
    for (const fn of this.statusListeners) fn(next);
  }

  private connect() {
    if (typeof WebSocket === "undefined") return;
    if (this.symbols.size === 0) {
      this.setStatus("idle");
      return;
    }
    this.clearTimers();
    this.generation += 1;
    const gen = this.generation;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
    }
    const provider = getWsProvider(this.providerName);
    this.setStatus(this.backoffIdx > 0 ? "reconnecting" : "connecting");
    const ws = new WebSocket(provider.getTickerStreamUrl());
    this.ws = ws;

    ws.onopen = () => {
      if (gen !== this.generation) return;
      this.backoffIdx = 0;
      this.lastMessageAt = Date.now();
      this.setStatus("connected");
      const symbols = [...this.symbols];
      if (symbols.length) ws.send(provider.subscribePayload(symbols));
      this.armHeartbeat();
    };

    ws.onmessage = (ev) => {
      if (gen !== this.generation) return;
      this.lastMessageAt = Date.now();
      let data: unknown;
      try {
        data = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (provider.isPong(data, this.pingId) || provider.isHeartbeat(data)) {
        this.clearPongWait();
        return;
      }
      const ticker = provider.parseTickerMessage(data);
      if (ticker) {
        for (const fn of this.tickerListeners) fn(ticker);
      }
    };

    ws.onerror = () => {
      /* onclose handles recovery */
    };

    ws.onclose = () => {
      if (gen !== this.generation) return;
      this.ws = null;
      this.clearTimers();
      if (this.closedByUser) {
        this.setStatus("disconnected");
        return;
      }
      this.scheduleReconnect();
    };
  }

  private armHeartbeat() {
    this.clearHeartbeat();
    const provider = getWsProvider(this.providerName);
    if (this.providerName === "coinbase") {
      this.staleTimer = window.setInterval(() => {
        if (Date.now() - this.lastMessageAt > HEARTBEAT_STALE_MS) {
          this.reconnectNow();
        }
      }, 5000);
      return;
    }
    this.pingTimer = window.setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const payload = provider.pingPayload(++this.pingId);
      if (!payload) return;
      this.ws.send(payload);
      this.clearPongWait();
      this.pongTimer = window.setTimeout(() => {
        this.reconnectNow();
      }, PONG_WAIT_MS);
    }, PING_EVERY_MS);
  }

  private scheduleReconnect() {
    this.setStatus("reconnecting");
    const wait = BACKOFF[Math.min(this.backoffIdx, BACKOFF.length - 1)];
    this.backoffIdx += 1;
    this.reconnectTimer = window.setTimeout(() => this.connect(), wait);
  }

  private reconnectNow() {
    this.clearTimers();
    this.connect();
  }

  private clearPongWait() {
    if (this.pongTimer != null) {
      window.clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  private clearHeartbeat() {
    if (this.pingTimer != null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.staleTimer != null) {
      window.clearInterval(this.staleTimer);
      this.staleTimer = null;
    }
    this.clearPongWait();
  }

  private clearTimers() {
    this.clearHeartbeat();
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

let singleton: WsManager | null = null;

export function getWsManager(provider: DataProviderName = "coinbase"): WsManager {
  if (typeof window === "undefined") {
    throw new Error("WebSocket manager is client-only");
  }
  if (!singleton) singleton = new WsManager(provider);
  return singleton;
}
