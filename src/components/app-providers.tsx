import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { usePrefsStore } from "@/lib/stores/prefs-store";

export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
            staleTime: 5_000,
          },
        },
      }),
  );
  const theme = usePrefsStore((s) => s.theme);
  const resolved =
    theme === "system"
      ? typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark"
      : theme;
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={250}>
        {children}
        <Toaster
          theme={resolved}
          position="bottom-right"
          toastOptions={{
            className:
              "bg-card text-foreground border border-border shadow-border",
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
