import type { AggTrade, DataProviderName, DepthSnapshot } from "@/lib/market/types";
import { toBinanceSymbol, toCanonical } from "@/lib/market/symbols";

const WS_BASE = "wss://stream.binance.com:9443/stream";
const BACKOFF = [1000, 2000, 4000, 8000, 15000, 30000];

type DepthListener = (depth: DepthSnapshot) => void;
type TradeListener = (trade: AggTrade) => void;
type StatusListener = (connected: boolean) => void;

export class DepthTapeWs {
  private ws: WebSocket | null = null;
  private symbol: string | null = null;
  private provider: DataProviderName = "binance";
  private depthListeners = new Set<DepthListener>();
  private tradeListeners = new Set<TradeListener>();
  private statusListeners = new Set<StatusListener>();
  private reconnectTimer: number | null = null;
  private backoffIdx = 0;
  private closedByUser = false;
  private generation = 0;
  private lastMessageAt = 0;
  private staleTimer: number | null = null;

  onDepth(fn: DepthListener): () => void {
    this.depthListeners.add(fn);
    return () => this.depthListeners.delete(fn);
  }

  onTrade(fn: TradeListener): () => void {
    this.tradeListeners.add(fn);
    return () => this.tradeListeners.delete(fn);
  }

  onStatus(fn: StatusListener): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  setSymbol(symbol: string | null, provider: DataProviderName = "binance") {
    this.provider = provider;
    if (symbol === this.symbol) return;
    this.symbol = symbol;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.unsubscribe();
      if (symbol) this.subscribe(symbol);
    }
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
      try { this.ws.close(); } catch { /* ignore */ }
    }
    this.ws = null;
    this.emitStatus(false);
  }

  private connect() {
    if (typeof WebSocket === "undefined") return;
    if (!this.symbol) return;
    this.clearTimers();
    this.generation += 1;
    const gen = this.generation;
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
    }
    const ws = new WebSocket(WS_BASE);
    this.ws = ws;

    ws.onopen = () => {
      if (gen !== this.generation) return;
      this.backoffIdx = 0;
      this.lastMessageAt = Date.now();
      this.emitStatus(true);
      if (this.symbol) this.subscribe(this.symbol);
      this.armStaleCheck();
    };

    ws.onmessage = (ev) => {
      if (gen !== this.generation) return;
      this.lastMessageAt = Date.now();
      let data: unknown;
      try { data = JSON.parse(String(ev.data)); } catch { return; }
      this.handleMessage(data);
    };

    ws.onerror = () => { /* onclose handles recovery */ };

    ws.onclose = () => {
      if (gen !== this.generation) return;
      this.ws = null;
      this.clearTimers();
      this.emitStatus(false);
      if (!this.closedByUser) this.scheduleReconnect();
    };
  }

  private handleMessage(msg: unknown) {
    const raw = msg as { stream?: string; data?: Record<string, unknown> };
    const stream = raw.stream ?? "";
    const data = (raw.data ?? raw) as Record<string, unknown>;

    if (stream.includes("@depth20")) {
      this.parseDepth(data);
    } else if (stream.includes("@aggTrade")) {
      this.parseTrade(data);
    }
  }

  private parseDepth(data: Record<string, unknown>) {
    const symbol = toCanonical(String(data.s ?? ""));
    const bidsRaw = data.bids as string[][] | undefined;
    const asksRaw = data.asks as string[][] | undefined;
    if (!bidsRaw || !asksRaw) return;
    const depth: DepthSnapshot = {
      symbol,
      bids: bidsRaw.map(([price, qty]) => ({ price, qty })),
      asks: asksRaw.map(([price, qty]) => ({ price, qty })),
      lastUpdate: Date.now(),
    };
    for (const fn of this.depthListeners) fn(depth);
  }

  private parseTrade(data: Record<string, unknown>) {
    const trade: AggTrade = {
      id: String(data.a ?? ""),
      symbol: toCanonical(String(data.s ?? "")),
      price: String(data.p ?? "0"),
      qty: String(data.q ?? "0"),
      isBuyerMaker: Boolean(data.m),
      timestamp: Number(data.T ?? Date.now()),
    };
    for (const fn of this.tradeListeners) fn(trade);
  }

  private subscribe(symbol: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const binanceSymbol = toBinanceSymbol(symbol).toLowerCase();
    const params = [`${binanceSymbol}@depth20@100ms`, `${binanceSymbol}@aggTrade`];
    this.ws.send(JSON.stringify({ method: "SUBSCRIBE", params, id: Date.now() }));
  }

  private unsubscribe() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.symbol) return;
    const binanceSymbol = toBinanceSymbol(this.symbol).toLowerCase();
    const params = [`${binanceSymbol}@depth20@100ms`, `${binanceSymbol}@aggTrade`];
    this.ws.send(JSON.stringify({ method: "UNSUBSCRIBE", params, id: Date.now() }));
  }

  private emitStatus(connected: boolean) {
    for (const fn of this.statusListeners) fn(connected);
  }

  private armStaleCheck() {
    this.clearStaleCheck();
    this.staleTimer = window.setInterval(() => {
      if (Date.now() - this.lastMessageAt > 30_000) this.reconnectNow();
    }, 5000);
  }

  private clearStaleCheck() {
    if (this.staleTimer != null) {
      window.clearInterval(this.staleTimer);
      this.staleTimer = null;
    }
  }

  private scheduleReconnect() {
    const wait = BACKOFF[Math.min(this.backoffIdx, BACKOFF.length - 1)];
    this.backoffIdx += 1;
    this.reconnectTimer = window.setTimeout(() => this.connect(), wait);
  }

  private reconnectNow() {
    this.clearTimers();
    this.connect();
  }

  private clearTimers() {
    this.clearStaleCheck();
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

let singleton: DepthTapeWs | null = null;

export function getDepthTapeWs(): DepthTapeWs {
  if (typeof window === "undefined") {
    throw new Error("DepthTapeWs is client-only");
  }
  if (!singleton) singleton = new DepthTapeWs();
  return singleton;
}
