"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type {
  NoteVisibility,
  TimelineActivity,
  TimelineNote,
} from "@/features/shared/types/notes";

type TimelineRow =
  | { type: "note"; row: TimelineNote }
  | { type: "activity"; row: TimelineActivity };

type Props = {
  notes: TimelineNote[];
  activities: TimelineActivity[];
  onAddNote?: (body: string, visibility: NoteVisibility) => Promise<void>;
  addingNote?: boolean;
  loading?: boolean;
  composerDisabled?: boolean;
};

function visibilityLabel(visibility: NoteVisibility): string {
  return visibility === "USER_VISIBLE" ? "Send to User" : "Private";
}

function formatWhen(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function NotesTimeline({
  notes,
  activities,
  onAddNote,
  addingNote = false,
  loading = false,
  composerDisabled = false,
}: Props) {
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<NoteVisibility>("PRIVATE");

  const rows: TimelineRow[] = [
    ...notes.map((row) => ({ type: "note" as const, row })),
    ...activities.map((row) => ({ type: "activity" as const, row })),
  ].sort(
    (a, b) =>
      new Date(b.row.createdAt).getTime() - new Date(a.row.createdAt).getTime(),
  );

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!onAddNote || !body.trim() || addingNote) return;
    await onAddNote(body.trim(), visibility);
    setBody("");
    setVisibility("PRIVATE");
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading timeline…</p>;
  }

  return (
    <div className="space-y-4">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes or activity yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((entry) => {
            if (entry.type === "note") {
              const note = entry.row;
              return (
                <li
                  key={`note-${note.id}`}
                  className="rounded-md border border-border bg-muted/20 p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded bg-background px-1.5 py-0.5 font-medium text-foreground">
                      Note
                    </span>
                    <span>{visibilityLabel(note.visibility)}</span>
                    <span>·</span>
                    <span>Author {note.authorUserId}</span>
                    <span>·</span>
                    <span>{formatWhen(note.createdAt)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap">{note.body}</p>
                </li>
              );
            }

            const activity = entry.row;
            return (
              <li
                key={`activity-${activity.id}`}
                className="rounded-md border border-dashed border-border p-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded bg-background px-1.5 py-0.5 font-medium text-foreground">
                    Activity
                  </span>
                  <span className="font-medium text-foreground">
                    {activity.kind}
                  </span>
                  <span>·</span>
                  <span>{activity.actorUserId ?? "system"}</span>
                  <span>·</span>
                  <span>{formatWhen(activity.createdAt)}</span>
                </div>
                <p className="mt-2">{activity.summary}</p>
              </li>
            );
          })}
        </ul>
      )}

      {onAddNote ? (
        <form className="space-y-2 border-t border-border pt-3" onSubmit={onSubmit}>
          <Label htmlFor="note-body">Add note</Label>
          <textarea
            id="note-body"
            className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={composerDisabled || addingNote}
            placeholder="Write an internal note…"
          />
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="note-visibility">Visibility</Label>
              <select
                id="note-visibility"
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={visibility}
                onChange={(event) =>
                  setVisibility(event.target.value as NoteVisibility)
                }
                disabled={composerDisabled || addingNote}
              >
                <option value="PRIVATE">Private</option>
                <option value="USER_VISIBLE">Send to User</option>
              </select>
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={composerDisabled || addingNote || !body.trim()}
            >
              {addingNote ? "Adding…" : "Add note"}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
