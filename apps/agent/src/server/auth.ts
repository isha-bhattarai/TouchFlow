import jwt from "jsonwebtoken";

export interface DeviceTokenPayload {
  deviceId: string;
  deviceName: string;
}

const ISSUER = "touchflow-agent";
const TOKEN_TTL = "30d";

/** Issue a long-lived token for a successfully paired device. */
export function signDeviceToken(
  payload: DeviceTokenPayload,
  secret: string,
): string {
  return jwt.sign(payload, secret, { issuer: ISSUER, expiresIn: TOKEN_TTL });
}

/** Returns the payload if the token is valid and untampered, else null. */
export function verifyDeviceToken(
  token: string,
  secret: string,
): DeviceTokenPayload | null {
  try {
    const decoded = jwt.verify(token, secret, { issuer: ISSUER });
    if (
      typeof decoded === "object" &&
      decoded !== null &&
      typeof decoded.deviceId === "string" &&
      typeof decoded.deviceName === "string"
    ) {
      return { deviceId: decoded.deviceId, deviceName: decoded.deviceName };
    }
    return null;
  } catch {
    return null;
  }
}
