"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";

import { AppSelect } from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type {
  NoteVisibility,
  TimelineActivity,
  TimelineNote,
} from "@/features/shared/types/notes";
import { cn } from "@/lib/utils";

type TimelineRow =
  | { type: "note"; row: TimelineNote }
  | { type: "activity"; row: TimelineActivity };

type Props = {
  notes: TimelineNote[];
  activities: TimelineActivity[];
  onAddNote?: (body: string, visibility: NoteVisibility) => Promise<void>;
  onDeleteNote?: (noteId: string) => Promise<void>;
  addingNote?: boolean;
  deletingNoteId?: string | null;
  loading?: boolean;
  composerDisabled?: boolean;
  /** Cool slate rail styling for the CRM patient sidebar */
  variant?: "default" | "cool";
  /** Fixed panel height so the composer stays pinned */
  className?: string;
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

function authorLabel(note: TimelineNote): string {
  return note.authorName?.trim() || "Unknown";
}

export function NotesTimeline({
  notes,
  activities,
  onAddNote,
  onDeleteNote,
  addingNote = false,
  deletingNoteId = null,
  loading = false,
  composerDisabled = false,
  variant = "default",
  className,
}: Props) {
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<NoteVisibility>("PRIVATE");
  const cool = variant === "cool";

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
    return (
      <p
        className={
          cool
            ? "text-sm text-slate-500 dark:text-slate-400"
            : "text-sm text-muted-foreground"
        }
      >
        Loading timeline…
      </p>
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {rows.length === 0 ? (
          <p
            className={
              cool
                ? "text-sm text-slate-500 dark:text-slate-400"
                : "text-sm text-muted-foreground"
            }
          >
            No notes or activity yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((entry) => {
              if (entry.type === "note") {
                const note = entry.row;
                const deleting = deletingNoteId === note.id;
                return (
                  <li
                    key={`note-${note.id}`}
                    className={
                      cool
                        ? "rounded-xl border border-slate-200/80 bg-white/90 p-3 text-sm shadow-sm dark:border-slate-600 dark:bg-slate-900/70"
                        : "rounded-md border border-border bg-muted/20 p-3 text-sm"
                    }
                  >
                    <div
                      className={cn(
                        "flex flex-wrap items-start gap-2 text-xs",
                        cool
                          ? "text-slate-500 dark:text-slate-400"
                          : "text-muted-foreground",
                      )}
                    >
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        <span
                          className={
                            cool
                              ? "rounded-md bg-slate-800 px-1.5 py-0.5 font-medium text-sky-200"
                              : "rounded bg-background px-1.5 py-0.5 font-medium text-foreground"
                          }
                        >
                          Note
                        </span>
                        <span>{visibilityLabel(note.visibility)}</span>
                        <span>·</span>
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          {authorLabel(note)}
                        </span>
                        <span>·</span>
                        <span>{formatWhen(note.createdAt)}</span>
                      </div>
                      {onDeleteNote ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 shrink-0 px-2 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/50 dark:hover:text-red-300"
                          disabled={deleting}
                          onClick={() => void onDeleteNote(note.id)}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                          {deleting ? "…" : "Delete"}
                        </Button>
                      ) : null}
                    </div>
                    <p
                      className={cn(
                        "mt-2 whitespace-pre-wrap",
                        cool
                          ? "text-slate-800 dark:text-slate-100"
                          : "text-foreground",
                      )}
                    >
                      {note.body}
                    </p>
                  </li>
                );
              }

              const activity = entry.row;
              return (
                <li
                  key={`activity-${activity.id}`}
                  className={
                    cool
                      ? "rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-3 text-sm dark:border-slate-600 dark:bg-slate-900/40"
                      : "rounded-md border border-dashed border-border p-3 text-sm"
                  }
                >
                  <div
                    className={
                      cool
                        ? "flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400"
                        : "flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                    }
                  >
                    <span
                      className={
                        cool
                          ? "rounded-md bg-slate-200 px-1.5 py-0.5 font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-100"
                          : "rounded bg-background px-1.5 py-0.5 font-medium text-foreground"
                      }
                    >
                      Activity
                    </span>
                    <span className="font-medium text-slate-800 dark:text-slate-100">
                      {activity.kind}
                    </span>
                    <span>·</span>
                    <span>{activity.actorUserId ?? "system"}</span>
                    <span>·</span>
                    <span>{formatWhen(activity.createdAt)}</span>
                  </div>
                  <p className="mt-2 text-slate-700 dark:text-slate-200">
                    {activity.summary}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {onAddNote ? (
        <form
          className={cn(
            "shrink-0 space-y-2 border-t pt-3",
            cool
              ? "border-slate-200/80 dark:border-slate-700"
              : "border-border",
          )}
          onSubmit={onSubmit}
        >
          <Label
            htmlFor="note-body"
            className={cool ? "text-slate-700 dark:text-slate-200" : undefined}
          >
            Add note
          </Label>
          <textarea
            id="note-body"
            className={
              cool
                ? "min-h-20 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                : "min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            }
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={composerDisabled || addingNote}
            placeholder="Write an internal note…"
          />
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <Label
                htmlFor="note-visibility"
                className={
                  cool ? "text-slate-700 dark:text-slate-200" : undefined
                }
              >
                Visibility
              </Label>
              <AppSelect
                value={visibility}
                onValueChange={(next) =>
                  setVisibility(next as NoteVisibility)
                }
                aria-label="Note visibility"
                disabled={composerDisabled || addingNote}
                className="w-full"
                options={[
                  { value: "PRIVATE", label: "Private" },
                  { value: "USER_VISIBLE", label: "Send to User" },
                ]}
              />
            </div>
            <Button
              type="submit"
              size="sm"
              className={cn(
                "h-9 shrink-0",
                cool && "bg-slate-800 text-white hover:bg-slate-700",
              )}
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
