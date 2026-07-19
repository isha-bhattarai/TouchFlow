import { useCallback, useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import ConnectScreen from "./src/screens/ConnectScreen";
import ConnectedScreen from "./src/screens/ConnectedScreen";
import { loadSession, type StoredSession } from "./src/lib/storage";

export default function App() {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [lastHost, setLastHost] = useState<string | undefined>(undefined);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadSession().then((stored) => {
      setSession(stored);
      setLastHost(stored?.host);
      setReady(true);
    });
  }, []);

  const handleDisconnected = useCallback((forgetDevice: boolean) => {
    setSession((current) => {
      if (current !== null) setLastHost(current.host);
      return null;
    });
    if (forgetDevice) setLastHost(undefined);
  }, []);

  if (!ready) return null;

  return (
    <>
      <StatusBar style="light" />
      {session === null ? (
        <ConnectScreen initialHost={lastHost} onConnected={setSession} />
      ) : (
        <ConnectedScreen session={session} onDisconnected={handleDisconnected} />
      )}
    </>
  );
}
