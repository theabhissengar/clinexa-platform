"use client";

import { CheckCircle2, FileUp, Loader2, UploadCloud, XCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createUploadSession,
  finalizeUploadSession,
  listAdminAssets,
  updateAsset,
  uploadSessionContent,
} from "@/features/assets/api/assets-api";
import {
  AssetLibraryHeader,
  AssetLibraryShell,
} from "@/features/assets/components/asset-library-shell";
import {
  nextDuplicateName,
  namesEqual,
  splitFilename,
} from "@/features/assets/lib/duplicate-filename";
import {
  ASSET_ACCEPT,
  ASSET_ALLOWED_MIMES,
  ASSET_MAX_BYTES,
  formatAssetBytes,
  isImageMime,
  resolveFileMime,
} from "@/features/assets/lib/mime-from-filename";
import { cn } from "@/lib/utils";

type QueueStatus =
  | "queued"
  | "session"
  | "uploading"
  | "finalizing"
  | "done"
  | "error";

type QueueItem = {
  localId: string;
  file: File;
  mime: string;
  previewUrl: string | null;
  altText: string;
  caption: string;
  status: QueueStatus;
  /** Final storage name (may differ from file.name after duplicate rename). */
  uploadFilename?: string;
  error?: string;
  assetId?: string;
  metaError?: string;
};

type DuplicatePrompt = {
  localId: string;
  originalName: string;
  nextName: string;
};

function statusLabel(status: QueueStatus) {
  switch (status) {
    case "queued":
      return "Queued";
    case "session":
      return "Opening session…";
    case "uploading":
      return "Uploading…";
    case "finalizing":
      return "Finalizing…";
    case "done":
      return "Ready";
    case "error":
      return "Failed";
  }
}

function hasRequiredMetadata(item: QueueItem) {
  return item.altText.trim().length > 0 && item.caption.trim().length > 0;
}

async function fetchExistingFilenames(filename: string): Promise<string[]> {
  const { base } = splitFilename(filename);
  try {
    const res = await listAdminAssets({
      q: base || filename,
      take: 100,
    });
    return res.items.map((a) => a.originalFilename);
  } catch {
    return [];
  }
}

export function AssetUploadPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showMetaGate, setShowMetaGate] = useState(false);
  const [dupDialogOpen, setDupDialogOpen] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicatePrompt[]>([]);
  const pendingUploadRef = useRef<QueueItem[] | null>(null);

  const patchItem = useCallback(
    (localId: string, patch: Partial<QueueItem>) => {
      setItems((prev) =>
        prev.map((item) =>
          item.localId === localId ? { ...item, ...patch } : item,
        ),
      );
    },
    [],
  );

  function addFiles(fileList: FileList | File[]) {
    const next: QueueItem[] = [];
    for (const file of Array.from(fileList)) {
      const mime = resolveFileMime(file);
      if (
        !mime ||
        !ASSET_ALLOWED_MIMES.includes(
          mime as (typeof ASSET_ALLOWED_MIMES)[number],
        )
      ) {
        toast.error(`Skipped ${file.name}: type not allowed.`);
        continue;
      }
      if (file.size > ASSET_MAX_BYTES) {
        toast.error(
          `Skipped ${file.name}: exceeds ${formatAssetBytes(ASSET_MAX_BYTES)}.`,
        );
        continue;
      }
      next.push({
        localId: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        mime,
        previewUrl: isImageMime(mime) ? URL.createObjectURL(file) : null,
        altText: "",
        caption: "",
        status: "queued",
      });
    }
    if (next.length) {
      setItems((prev) => [...prev, ...next]);
      setShowMetaGate(false);
    }
  }

  function removeItem(localId: string) {
    setItems((prev) => {
      const target = prev.find((i) => i.localId === localId);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.localId !== localId);
    });
  }

  async function uploadOne(item: QueueItem) {
    if (!hasRequiredMetadata(item)) {
      patchItem(item.localId, {
        metaError: "Alt text and caption are required before upload.",
      });
      return null;
    }

    const filename = item.uploadFilename?.trim() || item.file.name;

    patchItem(item.localId, {
      status: "session",
      error: undefined,
      metaError: undefined,
      uploadFilename: filename,
    });
    try {
      const session = await createUploadSession({
        originalFilename: filename,
        mimeType: item.mime,
      });
      patchItem(item.localId, { status: "uploading" });
      await uploadSessionContent(session.id, item.file);
      patchItem(item.localId, { status: "finalizing" });
      const asset = await finalizeUploadSession(session.id);
      await updateAsset(asset.id, {
        altText: item.altText.trim(),
        caption: item.caption.trim(),
      });
      patchItem(item.localId, { status: "done", assetId: asset.id });
      return asset.id;
    } catch (err) {
      const message =
        err && typeof err === "object" && "response" in err
          ? "Upload rejected by server (MIME, size, or session)."
          : "Upload failed. Check connection and try again.";
      patchItem(item.localId, { status: "error", error: message });
      return null;
    }
  }

  async function runUploadQueue(queue: QueueItem[]) {
    setBusy(true);
    let success = 0;
    for (const item of queue) {
      const id = await uploadOne({
        ...item,
        status: "queued",
        error: undefined,
      });
      if (id) success += 1;
    }
    setBusy(false);
    if (success > 0) {
      toast.success(
        success === 1
          ? "Asset uploaded with metadata."
          : `${success} assets uploaded with metadata.`,
      );
    }
  }

  async function startUpload() {
    const pending = items.filter(
      (i) => i.status === "queued" || i.status === "error",
    );
    if (!pending.length) {
      toast.message("Add files to upload.");
      return;
    }

    const incomplete = pending.filter((i) => !hasRequiredMetadata(i));
    if (incomplete.length) {
      setShowMetaGate(true);
      for (const item of incomplete) {
        patchItem(item.localId, {
          metaError: "Alt text and caption are required before upload.",
        });
      }
      toast.error(
        incomplete.length === 1
          ? "Enter alt text and caption for the file before uploading."
          : `Enter alt text and caption for ${incomplete.length} files before uploading.`,
      );
      return;
    }

    setShowMetaGate(false);
    setBusy(true);

    const claimed: string[] = [];
    const conflicts: DuplicatePrompt[] = [];
    const prepared: QueueItem[] = [];

    for (const item of pending) {
      const originalName = item.file.name;
      const existing = await fetchExistingFilenames(originalName);
      const pool = [...existing, ...claimed];
      const taken = pool.some((n) => namesEqual(n, originalName));
      if (taken) {
        const nextName = nextDuplicateName(originalName, pool);
        conflicts.push({
          localId: item.localId,
          originalName,
          nextName,
        });
        claimed.push(nextName);
        prepared.push({ ...item, uploadFilename: nextName });
      } else {
        claimed.push(originalName);
        prepared.push({
          ...item,
          uploadFilename: originalName,
        });
      }
    }

    setBusy(false);

    if (conflicts.length) {
      pendingUploadRef.current = prepared;
      setDuplicates(conflicts);
      setDupDialogOpen(true);
      return;
    }

    await runUploadQueue(prepared);
  }

  async function confirmDuplicateUpload() {
    const queue = pendingUploadRef.current;
    pendingUploadRef.current = null;
    setDuplicates([]);
    if (!queue?.length) return;
    for (const item of queue) {
      if (item.uploadFilename) {
        patchItem(item.localId, { uploadFilename: item.uploadFilename });
      }
    }
    await runUploadQueue(queue);
  }

  const pendingCount = items.filter(
    (i) => i.status === "queued" || i.status === "error",
  ).length;
  const pendingReady = items.filter(
    (i) =>
      (i.status === "queued" || i.status === "error") && hasRequiredMetadata(i),
  ).length;
  const canUpload = pendingCount > 0 && pendingReady === pendingCount && !busy;

  return (
    <AssetLibraryShell backHref="/guardian/assets">
      <AssetLibraryHeader
        compact
        eyebrow="Ingest"
        title="Upload assets"
        description="Drop reusable business media here — images and PDFs. Alt text and caption are required for every file before upload can finish."
      />

      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (e.currentTarget === e.target) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "group relative mx-auto flex w-full max-w-3xl cursor-pointer flex-col items-center justify-center gap-2.5 overflow-hidden rounded-xl border-2 border-dashed px-4 py-6 text-center transition-all duration-300 sm:gap-3 sm:rounded-2xl sm:px-6 sm:py-8",
          dragging
            ? "scale-[1.01] border-info bg-info/10 shadow-[0_0_0_1px_oklch(0.55_0.1_230/0.35)]"
            : "border-border/80 bg-card/60 hover:border-info/50 hover:bg-card/90",
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40 [background:radial-gradient(circle_at_50%_120%,oklch(0.55_0.1_230/0.2),transparent_60%)]"
        />
        <div className="relative flex size-10 items-center justify-center rounded-xl bg-info/15 text-info ring-1 ring-info/25 transition-transform duration-300 group-hover:scale-105 sm:size-12 sm:rounded-2xl">
          <UploadCloud className="size-5 sm:size-6" />
        </div>
        <div className="relative space-y-0.5 sm:space-y-1">
          <p className="text-sm font-medium text-foreground sm:text-base">
            Drop files here or click to browse
          </p>
          <p className="text-xs text-muted-foreground sm:text-sm">
            JPEG, PNG, GIF, WebP, AVIF, SVG, PDF · up to{" "}
            {formatAssetBytes(ASSET_MAX_BYTES)} each
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ASSET_ACCEPT}
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 ? (
        <div className="mt-8 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">
                Queue · {items.length} file{items.length === 1 ? "" : "s"}
              </p>
              {pendingCount > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Metadata ready: {pendingReady}/{pendingCount}
                  {showMetaGate && pendingReady < pendingCount
                    ? " — fill alt text and caption on each card"
                    : ""}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  for (const item of items) {
                    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
                  }
                  setItems([]);
                  setShowMetaGate(false);
                }}
              >
                Clear
              </Button>
              <Button
                type="button"
                size="sm"
                className="border-transparent bg-info text-info-foreground hover:bg-info/90"
                disabled={!canUpload}
                title={
                  !canUpload && pendingCount > 0
                    ? "Enter alt text and caption for every file first"
                    : undefined
                }
                onClick={() => void startUpload()}
              >
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <FileUp className="size-4" />
                    Upload all
                  </>
                )}
              </Button>
            </div>
          </div>

          <ul className="grid gap-4 lg:grid-cols-2">
            {items.map((item) => {
              const editable =
                item.status === "queued" || item.status === "error";
              const metaOk = hasRequiredMetadata(item);
              return (
                <li
                  key={item.localId}
                  className={cn(
                    "overflow-hidden rounded-xl border bg-card/80 shadow-sm backdrop-blur-sm",
                    editable && !metaOk && showMetaGate
                      ? "border-destructive/50 ring-1 ring-destructive/20"
                      : "border-border/80",
                  )}
                >
                  <div className="grid gap-0 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)]">
                    <div className="relative aspect-4/3 bg-muted/40 sm:aspect-auto sm:min-h-full">
                      {item.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.previewUrl}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        <div className="flex size-full min-h-28 items-center justify-center text-muted-foreground sm:min-h-40">
                          <FileUp className="size-8 opacity-50" />
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-linear-to-t from-black/70 to-transparent px-3 py-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-white">
                          {item.status === "done" ? (
                            <CheckCircle2 className="size-3.5 text-emerald-300" />
                          ) : item.status === "error" ? (
                            <XCircle className="size-3.5 text-red-300" />
                          ) : item.status !== "queued" ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : null}
                          {statusLabel(item.status)}
                        </span>
                        {editable ? (
                          <button
                            type="button"
                            className="text-xs text-white/80 hover:text-white"
                            onClick={() => removeItem(item.localId)}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </div>

                        <div className="space-y-3 p-3.5">
                      <div>
                        <p className="truncate text-sm font-medium">
                          {item.uploadFilename || item.file.name}
                        </p>
                        {item.uploadFilename &&
                        item.uploadFilename !== item.file.name ? (
                          <p className="truncate text-[0.65rem] text-muted-foreground">
                            from {item.file.name}
                          </p>
                        ) : null}
                        <p className="text-xs text-muted-foreground">
                          {item.mime} · {formatAssetBytes(item.file.size)}
                        </p>
                      </div>

                      {editable ? (
                        <div className="space-y-2.5">
                          <div className="space-y-1">
                            <Label
                              htmlFor={`alt-${item.localId}`}
                              className="text-xs"
                            >
                              Alt text{" "}
                              <span className="text-destructive">*</span>
                            </Label>
                            <Input
                              id={`alt-${item.localId}`}
                              value={item.altText}
                              disabled={busy}
                              maxLength={500}
                              placeholder="Describe the asset"
                              className="h-8 bg-muted/30 text-sm"
                              aria-invalid={
                                showMetaGate && !item.altText.trim()
                              }
                              onChange={(e) =>
                                patchItem(item.localId, {
                                  altText: e.target.value,
                                  metaError: undefined,
                                })
                              }
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label
                              htmlFor={`caption-${item.localId}`}
                              className="text-xs"
                            >
                              Caption{" "}
                              <span className="text-destructive">*</span>
                            </Label>
                            <Input
                              id={`caption-${item.localId}`}
                              value={item.caption}
                              disabled={busy}
                              maxLength={2000}
                              placeholder="Short caption"
                              className="h-8 bg-muted/30 text-sm"
                              aria-invalid={
                                showMetaGate && !item.caption.trim()
                              }
                              onChange={(e) =>
                                patchItem(item.localId, {
                                  caption: e.target.value,
                                  metaError: undefined,
                                })
                              }
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          {item.metaError ? (
                            <p className="text-xs text-destructive">
                              {item.metaError}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <p>
                            <span className="font-medium text-foreground">
                              Alt ·{" "}
                            </span>
                            {item.altText}
                          </p>
                          <p>
                            <span className="font-medium text-foreground">
                              Caption ·{" "}
                            </span>
                            {item.caption}
                          </p>
                        </div>
                      )}

                      {item.error ? (
                        <p className="text-xs text-destructive">{item.error}</p>
                      ) : null}
                      {item.assetId ? (
                        <Link
                          href={`/guardian/assets/${item.assetId}`}
                          className="inline-block text-xs font-medium text-info hover:underline"
                        >
                          View in library →
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <ConfirmDialog
        open={dupDialogOpen}
        onOpenChange={(open) => {
          setDupDialogOpen(open);
          if (!open) {
            pendingUploadRef.current = null;
            setDuplicates([]);
          }
        }}
        title="Image name already exists"
        description={
          <span className="block space-y-2">
            <span className="block">
              One or more files use a name that is already in the Media Vault.
              Continue to upload them renamed with a number in parentheses?
            </span>
            <ul className="list-disc space-y-1 pl-4 text-left">
              {duplicates.map((d) => (
                <li key={d.localId}>
                  <span className="font-medium text-foreground">
                    {d.originalName}
                  </span>
                  {" → "}
                  <span className="text-foreground">{d.nextName}</span>
                </li>
              ))}
            </ul>
          </span>
        }
        confirmLabel="Yes, upload renamed"
        cancelLabel="Cancel"
        onConfirm={() => void confirmDuplicateUpload()}
      />
    </AssetLibraryShell>
  );
}
