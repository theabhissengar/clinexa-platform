"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createUploadSession,
  finalizeUploadSession,
  uploadSessionContent,
} from "@/features/assets/api/assets-api";

const ALLOWED = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "image/avif",
];

export function AssetUploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choose a file.");
      return;
    }
    if (!ALLOWED.includes(file.type)) {
      setError(`MIME type not allowed: ${file.type || "(unknown)"}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const session = await createUploadSession({
        originalFilename: file.name,
        mimeType: file.type,
      });
      await uploadSessionContent(session.id, file);
      const asset = await finalizeUploadSession(session.id);
      router.push(`/guardian/assets/${asset.id}/edit`);
    } catch {
      setError("Upload failed. Check MIME/size limits and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <Link
          href="/guardian/assets"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Asset Library
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          Upload asset
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Reusable business assets only. Private/PHI documents belong to
          Document Management — not here.
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          type="file"
          accept={ALLOWED.join(",")}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={busy || !file}>
          {busy ? "Uploading…" : "Upload"}
        </Button>
      </form>
    </main>
  );
}
