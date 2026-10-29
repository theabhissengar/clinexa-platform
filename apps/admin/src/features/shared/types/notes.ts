export type NoteVisibility = "PRIVATE" | "USER_VISIBLE";

export type TimelineNote = {
  id: string;
  body: string;
  visibility: NoteVisibility;
  authorUserId: string;
  authorName?: string | null;
  createdAt: string;
};

export type TimelineActivity = {
  id: string;
  kind: string;
  summary: string;
  actorUserId?: string | null;
  createdAt: string;
};
