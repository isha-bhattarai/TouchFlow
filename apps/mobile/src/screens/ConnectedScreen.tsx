import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as Battery from "expo-battery";
import { io } from "socket.io-client";
import Touchpad from "../components/Touchpad";
import { ConnectionManager, type ConnectionStatus } from "../lib/connection";
import { ReconnectScheduler } from "../lib/reconnect";
import { errorMessage } from "../lib/validate";
import { clearSession, type StoredSession } from "../lib/storage";
import { colors } from "../theme";

interface Props {
  session: StoredSession;
  onDisconnected(forgetDevice: boolean): void;
}

const BATTERY_REPORT_MS = 30_000;

function latencyColor(rtt: number): string {
  if (rtt < 40) return colors.success;
  if (rtt < 120) return colors.warning;
  return colors.danger;
}

export default function ConnectedScreen({ session, onDisconnected }: Props) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [retryIn, setRetryIn] = useState<number | null>(null);
  const [manager, setManager] = useState<ConnectionManager | null>(null);
  const managerRef = useRef<ConnectionManager | null>(null);
  const leavingRef = useRef(false);

  useEffect(() => {
    leavingRef.current = false;
    const platform = Platform.OS === "ios" ? "ios" : "android";
    const attempt = () => {
      setRetryIn(null);
      managerRef.current?.connectWithToken(session.host, session.token, platform);
    };
    const scheduler = new ReconnectScheduler(attempt);

    const manager = new ConnectionManager(
      (url, auth) => io(url, { transports: ["websocket"], auth }),
      {
        onStatus: (next) => {
          setStatus(next);
          if (next === "connected") {
            scheduler.reset();
            setError(null);
            setRetryIn(null);
          }
          // Wi-Fi blip or agent restart: heal automatically.
          if (next === "idle" && !leavingRef.current) {
            setRetryIn(scheduler.schedule() / 1_000);
          }
        },
        onLatency: setLatency,
        onError: (reason) => {
          if (reason === "invalid-token") {
            // Retrying a revoked token forever would be hostile — re-pair.
            clearSession().then(() => onDisconnected(true));
            return;
          }
          setError(errorMessage(reason));
          if (!leavingRef.current) {
            setRetryIn(scheduler.schedule() / 1_000);
          }
        },
      },
    );
    managerRef.current = manager;
    setManager(manager);
    attempt();

    const reportBattery = async () => {
      const level = await Battery.getBatteryLevelAsync();
      const state = await Battery.getBatteryStateAsync();
      manager.sendBatteryStatus(
        level,
        state === Battery.BatteryState.CHARGING ||
          state === Battery.BatteryState.FULL,
      );
    };
    const interval = setInterval(reportBattery, BATTERY_REPORT_MS);
    reportBattery();

    return () => {
      leavingRef.current = true;
      scheduler.cancel();
      clearInterval(interval);
      manager.disconnect();
    };
  }, [session, onDisconnected]);

  const connected = status === "connected";
  const statusLine = connected
    ? `Connected to ${session.host}`
    : retryIn !== null
      ? `Reconnecting in ${Math.round(retryIn)}s…`
      : "Reconnecting…";

  return (
    <View style={styles.root}>
      <View style={styles.statusRow}>
        <View
          style={[styles.dot, { backgroundColor: connected ? colors.success : colors.warning }]}
        />
        <Text style={styles.statusText}>{statusLine}</Text>
        {connected && latency !== null && (
          <View style={styles.latencyChip}>
            <View style={[styles.latencyDot, { backgroundColor: latencyColor(latency) }]} />
            <Text style={styles.latencyText}>{Math.max(1, Math.round(latency))} ms</Text>
          </View>
        )}
      </View>
      <Text style={styles.deviceName}>as {session.deviceName}</Text>

      {error !== null && !connected && <Text style={styles.error}>{error}</Text>}

      {manager !== null && connected ? (
        <Touchpad manager={manager} />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderTitle}>Touchpad</Text>
          <Text style={styles.placeholderText}>Waiting for connection…</Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.disconnect}
        onPress={() => {
          leavingRef.current = true;
          managerRef.current?.disconnect();
          onDisconnected(false);
        }}
        accessibilityRole="button"
      >
        <Text style={styles.disconnectText}>Disconnect</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: 24, paddingTop: 72 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { color: colors.text, fontSize: 17, fontWeight: "500", flex: 1 },
  latencyChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.glass,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  latencyDot: { width: 6, height: 6, borderRadius: 3 },
  latencyText: {
    color: colors.textMuted,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  deviceName: { color: colors.textMuted, fontSize: 13, marginTop: 4, marginLeft: 20 },
  error: { color: colors.danger, fontSize: 13, marginTop: 16, lineHeight: 18 },
  placeholder: {
    flex: 1,
    marginTop: 28,
    borderRadius: 24,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  placeholderTitle: { color: colors.textMuted, fontSize: 15, fontWeight: "600" },
  placeholderText: {
    color: colors.textFaint,
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 18,
  },
  disconnect: {
    marginTop: 24,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 13,
    alignItems: "center",
  },
  disconnectText: { color: colors.textMuted, fontSize: 15 },
});
