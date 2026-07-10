import { useEffect, useState } from 'react';

export function useSessions() {
  const [sessions, setSessions] = useState([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const es = new EventSource('/events');
    es.addEventListener('open', () => setConnected(true));
    es.addEventListener('error', () => setConnected(false));
    es.addEventListener('sessions', (e) => {
      setSessions(JSON.parse(e.data));
      setConnected(true);
    });
    return () => es.close();
  }, []);

  return { sessions, connected };
}
