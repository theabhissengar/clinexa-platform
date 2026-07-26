export type AuthUser = {
  id: string;
  email: string;
};

export type AuthTokensResponse = {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  user: AuthUser;
};

export type SessionResponse = {
  id: string;
  email: string;
  sessionId: string;
};

export type LoginCredentials = {
  email: string;
  password: string;
};
