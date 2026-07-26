export type AuthUser = {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
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
  roles: string[];
  permissions: string[];
};

export type LoginCredentials = {
  email: string;
  password: string;
};
