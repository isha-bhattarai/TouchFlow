import type { MouseButton } from "@touchflow/shared";

/**
 * Abstraction over OS-level input injection. The server logic depends on
 * this interface, never on nut-js directly — so tests inject a fake, CI
 * needs no native bindings, and the backend library stays swappable.
 */
export interface InputController {
  moveBy(dx: number, dy: number): Promise<void>;
  click(button: MouseButton, double: boolean): Promise<void>;
  pressLeft(): Promise<void>;
  releaseLeft(): Promise<void>;
  scroll(dx: number, dy: number): Promise<void>;
}

/** Used in tests and UI-only mode. */
export class NoopInputController implements InputController {
  async moveBy(): Promise<void> {}
  async click(): Promise<void> {}
  async pressLeft(): Promise<void> {}
  async releaseLeft(): Promise<void> {}
  async scroll(): Promise<void> {}
}

/**
 * Real implementation backed by @nut-tree-fork/nut-js. Loaded lazily so
 * simply importing this module never touches native code.
 *
 * OS permissions: on macOS the agent needs Accessibility access
 * (System Settings → Privacy & Security → Accessibility). Windows and
 * most Linux X11 desktops work out of the box; Wayland may need extra
 * configuration.
 */
export async function createNutInputController(): Promise<InputController> {
  const { mouse, Button, Point } = await import("@nut-tree-fork/nut-js");
  mouse.config.autoDelayMs = 0;
  mouse.config.mouseSpeed = 10_000;

  const toButton = (button: "left" | "right") =>
    button === "left" ? Button.LEFT : Button.RIGHT;

  return {
    async moveBy(dx, dy) {
      const pos = await mouse.getPosition();
      await mouse.setPosition(
        new Point(Math.round(pos.x + dx), Math.round(pos.y + dy)),
      );
    },
    async click(button, double) {
      if (double) await mouse.doubleClick(toButton(button));
      else await mouse.click(toButton(button));
    },
    async pressLeft() {
      await mouse.pressButton(Button.LEFT);
    },
    async releaseLeft() {
      await mouse.releaseButton(Button.LEFT);
    },
    async scroll(dx, dy) {
      const stepX = Math.round(dx);
      const stepY = Math.round(dy);
      if (stepY > 0) await mouse.scrollDown(stepY);
      else if (stepY < 0) await mouse.scrollUp(-stepY);
      if (stepX > 0) await mouse.scrollRight(stepX);
      else if (stepX < 0) await mouse.scrollLeft(-stepX);
    },
  };
}
