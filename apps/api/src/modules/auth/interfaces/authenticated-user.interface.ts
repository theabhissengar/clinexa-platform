/**
 * Principal attached to the request after successful AuthN.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  sessionId: string;
  tokenVersion: number;
}
