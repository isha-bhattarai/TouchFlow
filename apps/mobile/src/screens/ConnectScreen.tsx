import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { io } from "socket.io-client";
import { ConnectionManager, type ConnectionStatus } from "../lib/connection";
import { errorMessage, isValidCode, isValidHost, normalizeCode } from "../lib/validate";
import { saveSession } from "../lib/storage";
import { colors } from "../theme";

interface Props {
  initialHost?: string;
  onConnected(session: { host: string; token: string; deviceName: string }): void;
}

const deviceName =
  Platform.OS === "ios" ? "iPhone" : "Android phone";

export default function ConnectScreen({ initialHost, onConnected }: Props) {
  const [host, setHost] = useState(initialHost ?? "");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const busy = status === "connecting" || status === "pairing";
  const canSubmit = isValidHost(host) && isValidCode(normalizeCode(code)) && !busy;

  const connect = () => {
    setError(null);
    let token: string | null = null;
    const manager = new ConnectionManager(
      (url, auth) => io(url, { transports: ["websocket"], auth }),
      {
        onStatus: (next) => {
          setStatus(next);
          if (next === "connected" && token !== null) {
            const session = { host: host.trim(), token, deviceName };
            saveSession(session);
            onConnected(session);
          }
        },
        onPaired: (t) => {
          token = t;
        },
        onError: (reason) => setError(errorMessage(reason)),
      },
    );
    manager.connectWithCode(host.trim(), normalizeCode(code), deviceName);
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.wordmark}>TouchFlow</Text>
      <Text style={styles.tagline}>Pair with your computer</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Computer address</Text>
        <TextInput
          style={styles.input}
          value={host}
          onChangeText={setHost}
          placeholder="192.168.1.42"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
          accessibilityLabel="Computer IP address"
        />

        <Text style={[styles.label, styles.labelSpaced]}>Pairing code</Text>
        <TextInput
          style={[styles.input, styles.codeInput]}
          value={code}
          onChangeText={(t) => setCode(normalizeCode(t).slice(0, 6))}
          placeholder="••••••"
          placeholderTextColor={colors.textFaint}
          keyboardType="number-pad"
          maxLength={6}
          accessibilityLabel="Six digit pairing code"
        />

        {error !== null && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={connect}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel="Connect to computer"
        >
          {busy ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text style={styles.buttonText}>Connect</Text>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.hint}>
        The code is shown in the TouchFlow Agent window on your computer.
      </Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 24,
    justifyContent: "center",
  },
  wordmark: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: 1,
  },
  tagline: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 28,
  },
  card: {
    backgroundColor: colors.glass,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 2,
    marginBottom: 8,
  },
  labelSpaced: { marginTop: 18 },
  input: {
    backgroundColor: colors.glassDeep,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  codeInput: {
    fontSize: 28,
    letterSpacing: 12,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    marginTop: 12,
    lineHeight: 18,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  buttonDisabled: { opacity: 0.35 },
  buttonText: { color: colors.bg, fontSize: 16, fontWeight: "600" },
  hint: {
    color: colors.textFaint,
    fontSize: 12,
    textAlign: "center",
    marginTop: 20,
    lineHeight: 17,
  },
});
