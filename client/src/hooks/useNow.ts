import { useEffect, useState } from 'react';

/** Current time (ms), re-rendering every `intervalMs`. Pass an offset to follow the server clock. */
export function useNow(intervalMs = 1000, offset = 0) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset), intervalMs);
    setNow(Date.now() + offset);
    return () => clearInterval(id);
  }, [intervalMs, offset]);
  return now;
}
