/**
 * Access JWT identity claims (AuthN only — no role/permissions).
 */
export interface JwtPayload {
  /** Subject user id (UUID). */
  sub: string;
  userId: string;
  sessionId: string;
  tokenVersion: number;
  iat?: number;
  exp?: number;
}
