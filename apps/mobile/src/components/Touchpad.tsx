import { useEffect, useMemo, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type GestureResponderEvent,
} from "react-native";
import Slider from "@react-native-community/slider";
import * as Haptics from "expo-haptics";
import {
  MessageType,
  SENSITIVITY_DEFAULT,
  SENSITIVITY_MAX,
  SENSITIVITY_MIN,
  createMessage,
  type PointerClickMessage,
  type PointerDragEndMessage,
  type PointerDragStartMessage,
  type PointerMoveMessage,
  type ScrollMessage,
} from "@touchflow/shared";
import type { ConnectionManager } from "../lib/connection";
import { DeltaBatcher, TouchpadEngine, type TouchPoint } from "../lib/touchpad";
import { colors } from "../theme";

interface Props {
  manager: ConnectionManager;
}

function toPoints(event: GestureResponderEvent): TouchPoint[] {
  return event.nativeEvent.touches.map((t) => ({ x: t.pageX, y: t.pageY }));
}

export default function Touchpad({ manager }: Props) {
  const [sensitivity, setSensitivity] = useState(SENSITIVITY_DEFAULT);

  const { engine, moveBatcher, scrollBatcher } = useMemo(() => {
    const moveBatcher = new DeltaBatcher((dx, dy) =>
      manager.send(
        createMessage<PointerMoveMessage>({ t: MessageType.PointerMove, dx, dy }),
      ),
    );
    const scrollBatcher = new DeltaBatcher((dx, dy) =>
      manager.send(
        createMessage<ScrollMessage>({ t: MessageType.Scroll, dx, dy }),
      ),
    );
    const engine = new TouchpadEngine({
      onMove: (dx, dy) => moveBatcher.add(dx, dy),
      onScroll: (dx, dy) => scrollBatcher.add(dx, dy),
      onClick: (button, double) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        manager.send(
          createMessage<PointerClickMessage>({
            t: MessageType.PointerClick,
            button,
            double,
          }),
        );
      },
      onDragStart: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        manager.send(
          createMessage<PointerDragStartMessage>({
            t: MessageType.PointerDragStart,
          }),
        );
      },
      onDragEnd: () =>
        manager.send(
          createMessage<PointerDragEndMessage>({
            t: MessageType.PointerDragEnd,
          }),
        ),
    });
    return { engine, moveBatcher, scrollBatcher };
  }, [manager]);

  useEffect(() => {
    moveBatcher.start();
    scrollBatcher.start();
    return () => {
      moveBatcher.stop();
      scrollBatcher.stop();
    };
  }, [moveBatcher, scrollBatcher]);

  const sensitivityRef = useRef(sensitivity);
  useEffect(() => {
    sensitivityRef.current = sensitivity;
    engine.setSensitivity(sensitivity);
  }, [sensitivity, engine]);

  const click = (button: "left" | "right") =>
    manager.send(
      createMessage<PointerClickMessage>({
        t: MessageType.PointerClick,
        button,
        double: false,
      }),
    );

  return (
    <View style={styles.root}>
      <View
        style={styles.surface}
        accessibilityLabel="Trackpad surface"
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => engine.touchStart(toPoints(e), e.nativeEvent.timestamp)}
        onResponderMove={(e) => engine.touchMove(toPoints(e), e.nativeEvent.timestamp)}
        onResponderRelease={(e) => engine.touchEnd(toPoints(e), e.nativeEvent.timestamp)}
        onResponderTerminate={(e) => engine.touchEnd([], e.nativeEvent.timestamp)}
      >
        <Text style={styles.watermark}>TouchFlow</Text>
      </View>

      <View style={styles.buttons}>
        <TouchableOpacity
          style={styles.clickButton}
          onPress={() => click("left")}
          accessibilityRole="button"
          accessibilityLabel="Left click"
        />
        <TouchableOpacity
          style={styles.clickButton}
          onPress={() => click("right")}
          accessibilityRole="button"
          accessibilityLabel="Right click"
        />
      </View>

      <View style={styles.sliderRow}>
        <Text style={styles.sliderLabel}>Sensitivity</Text>
        <Slider
          style={styles.slider}
          minimumValue={SENSITIVITY_MIN}
          maximumValue={SENSITIVITY_MAX}
          value={sensitivity}
          onValueChange={setSensitivity}
          minimumTrackTintColor={colors.accent}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.accent}
          accessibilityLabel="Pointer sensitivity"
        />
        <Text style={styles.sliderValue}>{sensitivity.toFixed(1)}×</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, marginTop: 24 },
  surface: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.glass,
    alignItems: "center",
    justifyContent: "center",
  },
  watermark: {
    color: colors.textFaint,
    fontSize: 13,
    letterSpacing: 4,
    textTransform: "uppercase",
  },
  buttons: { flexDirection: "row", gap: 12, marginTop: 12 },
  clickButton: {
    flex: 1,
    height: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.glassDeep,
  },
  sliderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
  },
  sliderLabel: { color: colors.textMuted, fontSize: 12 },
  slider: { flex: 1, height: 32 },
  sliderValue: {
    color: colors.textMuted,
    fontSize: 12,
    width: 36,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
});
