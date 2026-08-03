export type AssetStatus =
  | "UPLOADED"
  | "ACTIVE"
  | "ARCHIVED"
  | "DELETED";

export type Asset = {
  id: string;
  storageProvider: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  altText: string | null;
  caption: string | null;
  status: AssetStatus;
  createdByUserId: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AssetListResponse = {
  items: Asset[];
  total: number;
  skip: number;
  take: number;
  statusCounts: Record<string, number>;
};

export type AssetUploadSession = {
  id: string;
  storageProvider: string;
  originalFilename: string;
  mimeType: string;
  expiresAt: string;
  uploadPath: string;
  status: string;
};

export type AssetHistoryRow = {
  id: string;
  action: string;
  changes: unknown;
  createdAt: string;
};

export type AssetActivityRow = {
  id: string;
  kind: string;
  summary: string;
  createdAt: string;
};
