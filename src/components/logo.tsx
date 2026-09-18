export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <rect width="28" height="28" rx="8" className="fill-card" />
        <rect x="0.5" y="0.5" width="27" height="27" rx="7.5" className="stroke-border" />
        <rect x="8" y="12" width="5" height="8" rx="1" className="fill-sell" />
        <rect x="14" y="6" width="6" height="14" rx="1" className="fill-buy" />
      </svg>
      {compact ? null : (
        <div className="leading-none">
          <div className="text-[18px] font-semibold tracking-tight">
            SUPER-CRYPTOS <sup>&reg;</sup>
          </div>
          <div className="mt-0.5 text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
            Paper Trading
          </div>
        </div>
      )}
    </div>
  );
}
