import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as Battery from "expo-battery";
import { io } from "socket.io-client";
import { ConnectionManager, type ConnectionStatus } from "../lib/connection";
import { errorMessage } from "../lib/validate";
import { clearSession, type StoredSession } from "../lib/storage";
import { colors } from "../theme";

interface Props {
  session: StoredSession;
  onDisconnected(forgetDevice: boolean): void;
}

const BATTERY_REPORT_MS = 30_000;

export default function ConnectedScreen({ session, onDisconnected }: Props) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const managerRef = useRef<ConnectionManager | null>(null);

  useEffect(() => {
    const manager = new ConnectionManager(
      (url, auth) => io(url, { transports: ["websocket"], auth }),
      {
        onStatus: setStatus,
        onError: (reason) => {
          setError(errorMessage(reason));
          if (reason === "invalid-token") {
            clearSession().then(() => onDisconnected(true));
          }
        },
      },
    );
    managerRef.current = manager;
    manager.connectWithToken(
      session.host,
      session.token,
      Platform.OS === "ios" ? "ios" : "android",
    );

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
      clearInterval(interval);
      manager.disconnect();
    };
  }, [session, onDisconnected]);

  const connected = status === "connected";

  return (
    <View style={styles.root}>
      <View style={styles.statusRow}>
        <View
          style={[styles.dot, { backgroundColor: connected ? colors.success : colors.warning }]}
        />
        <Text style={styles.statusText}>
          {connected ? `Connected to ${session.host}` : "Reconnecting…"}
        </Text>
      </View>
      <Text style={styles.deviceName}>as {session.deviceName}</Text>

      {error !== null && <Text style={styles.error}>{error}</Text>}

      <View style={styles.placeholder}>
        <Text style={styles.placeholderTitle}>Touchpad</Text>
        <Text style={styles.placeholderText}>
          Coming in the next milestone — this whole area becomes your trackpad.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.disconnect}
        onPress={() => {
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
  statusText: { color: colors.text, fontSize: 17, fontWeight: "500" },
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
