import { useEffect, useState } from "react";

// Poll an async fetcher every `ms`. Simple and good enough for a demo.
// NOTE: a nicer approach is Server-Sent Events (SSE): the API exposes a
// GET /api/stream EventSource and pushes on every bus event, removing the
// 1s lag. Left as polling here to keep the moving parts minimal.
export function usePolling<T>(fetcher: () => Promise<T>, ms = 1000): T | undefined {
  const [data, setData] = useState<T>();
  useEffect(() => {
    let active = true;
    const tick = () => fetcher().then((d) => active && setData(d));
    tick();
    const id = setInterval(tick, ms);
    return () => { active = false; clearInterval(id); };
  }, []);
  return data;
}
