import { useEffect } from "react";
import { useDepthTapeStore } from "@/lib/stores/depth-tape-store";
import { usePrefsStore } from "@/lib/stores/prefs-store";
import { getDepthTapeWs } from "@/lib/ws/depth-tape-ws";

export function useDepthTape() {
  const symbol = usePrefsStore((s) => s.selectedSymbol);
  const provider = usePrefsStore((s) => s.provider);

  useEffect(() => {
    const ws = getDepthTapeWs();
    ws.setSymbol(symbol, provider);
    ws.start();
    const offDepth = ws.onDepth((d) => useDepthTapeStore.getState().upsertDepth(d));
    const offTrade = ws.onTrade((t) => useDepthTapeStore.getState().pushTrade(t));
    return () => {
      offDepth();
      offTrade();
      ws.stop();
    };
  }, [symbol, provider]);
}
