"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Field, Input, Select, Textarea } from "@/components/forms";
import { Button, formatBytes } from "@/components/ui";

const ACCEPT = ["video/mp4", "video/quicktime", "video/webm"];

export function Uploader({ maxBytes, entries }: { maxBytes: number; entries: { id: string; name: string }[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function pick(f: File | undefined) {
    setError(null);
    if (!f) return setFile(null);
    if (f.size > maxBytes) {
      setFile(null);
      return setError(`That file is ${formatBytes(f.size)}; the limit is ${formatBytes(maxBytes)}.`);
    }
    if (f.type && !ACCEPT.includes(f.type)) {
      setFile(null);
      return setError("Choose an MP4, MOV or WebM video.");
    }
    setFile(f);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return setError("Choose a video file first.");
    const fd = new FormData(e.currentTarget);
    const qs = new URLSearchParams({
      filename: file.name,
      title: String(fd.get("title") ?? ""),
      description: String(fd.get("description") ?? ""),
      visibility: String(fd.get("visibility") ?? "private"),
      entryId: String(fd.get("entryId") ?? ""),
      trainingConsent: fd.get("trainingConsent") ? "1" : "0",
    });
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/videos?${qs}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (ev) => ev.lengthComputable && setProgress(Math.round((ev.loaded / ev.total) * 100));
    xhr.onload = () => {
      let body: { id?: string; error?: string; fieldErrors?: Record<string, string[]> } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status === 201 && body.id) {
        router.push(`/videos/${body.id}`);
      } else {
        setProgress(null);
        setError(body.error ?? `Upload failed (HTTP ${xhr.status}).`);
        setFieldErrors(body.fieldErrors ?? {});
      }
    };
    xhr.onerror = () => {
      setProgress(null);
      setError("The upload was interrupted. Check your connection and try again.");
    };
    setError(null);
    setProgress(0);
    xhr.send(file);
  }

  const busy = progress !== null;
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {error && (
        <p role="alert" className="rounded-[var(--radius-control)] bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed border-line-strong bg-surface px-4 py-10 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pick(e.dataTransfer.files[0]);
        }}
      >
        <p className="font-medium">{file ? file.name : "Drop a video here"}</p>
        <p className="text-sm text-muted">{file ? formatBytes(file.size) : `MP4, MOV or WebM · up to ${formatBytes(maxBytes)}`}</p>
        <input ref={fileRef} id="file" type="file" accept={ACCEPT.join(",")} className="sr-only" onChange={(e) => pick(e.target.files?.[0])} disabled={busy} />
        <label htmlFor="file" className="mt-2 cursor-pointer rounded-[var(--radius-control)] border border-line-strong px-3 py-1.5 text-sm hover:bg-surface-2">
          {file ? "Choose another file" : "Choose file"}
        </label>
      </div>
      <Field label="Title" name="title" error={fieldErrors.title}>
        <Input name="title" required maxLength={120} defaultValue={file?.name.replace(/\.[^.]+$/, "") ?? ""} key={file?.name} disabled={busy} />
      </Field>
      <Field label="Description" name="description">
        <Textarea name="description" maxLength={2000} rows={2} disabled={busy} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Skill shown (optional)" name="entryId">
          <Select name="entryId" defaultValue="" disabled={busy}>
            <option value="">Not specified</option>
            {entries.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Who can watch" name="visibility" hint="You can change this later.">
          <Select name="visibility" defaultValue="private" disabled={busy}>
            <option value="private">Only me</option>
            <option value="members">Signed-in members</option>
            <option value="public">Anyone with the link</option>
          </Select>
        </Field>
      </div>
      <label className="flex items-start gap-2 text-sm text-ink-2">
        <input type="checkbox" name="trainingConsent" className="mt-1" disabled={busy} />
        <span>
          Allow this clip to be used to evaluate or train a future skill-recognition model. Off by default; you can withdraw by deleting the video. Only upload
          videos you have the right to share, and get consent from anyone else who appears in them.
        </span>
      </label>
      {busy && (
        <div aria-live="polite">
          <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
            <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-sm text-muted">{progress < 100 ? `Uploading… ${progress}%` : "Checking the file…"}</p>
        </div>
      )}
      <div>
        <Button type="submit" disabled={busy || !file}>
          {busy ? "Uploading…" : "Upload video"}
        </Button>
      </div>
    </form>
  );
}
