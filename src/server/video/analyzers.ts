import { spawn } from "node:child_process";
import { env } from "@/lib/env";

/**
 * Boundary between the application and video-analysis models. An analyzer receives a
 * local file path plus metadata and returns structured results. New models plug in by
 * implementing this interface and registering below — nothing else changes.
 */
export type AnalysisInput = { videoId: string; filePath: string; mimeType: string };
export type AnalysisResult = {
  /** Machine-readable output. Shape is analyzer-specific and versioned by analyzerVersion. */
  data: Record<string, unknown>;
  /** Plain-language limitations shown next to the result. Required. */
  limitations: string[];
};

export interface VideoAnalyzer {
  readonly id: string;
  readonly label: string;
  readonly version: string;
  availability(): { available: true } | { available: false; reason: string };
  analyze(input: AnalysisInput): Promise<AnalysisResult>;
}

// ---------------------------------------------------------------------------
// 1. Technical metadata (real, deterministic): ffprobe.
// ---------------------------------------------------------------------------

export type ProbeResult = { durationMs: number | null; width: number | null; height: number | null; frameRate: string | null; codec: string | null; formatName: string };

export function ffprobe(filePath: string, timeoutMs = 20_000): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", filePath], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let errText = "";
    const timer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);
    proc.stdout.on("data", (d) => (out += d));
    proc.stderr.on("data", (d) => (errText += d));
    proc.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`ffprobe could not run: ${e.message}`));
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`ffprobe rejected the file: ${errText.trim().slice(0, 200) || `exit ${code}`}`));
      try {
        const json = JSON.parse(out) as { format?: { duration?: string; format_name?: string }; streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number; avg_frame_rate?: string }[] };
        const v = json.streams?.find((s) => s.codec_type === "video");
        if (!v) return reject(new Error("The file contains no video stream"));
        const dur = Number(json.format?.duration);
        resolve({
          durationMs: Number.isFinite(dur) ? Math.round(dur * 1000) : null,
          width: v.width ?? null,
          height: v.height ?? null,
          frameRate: v.avg_frame_rate && v.avg_frame_rate !== "0/0" ? v.avg_frame_rate : null,
          codec: v.codec_name ?? null,
          formatName: json.format?.format_name ?? "",
        });
      } catch {
        reject(new Error("ffprobe returned unreadable output"));
      }
    });
  });
}

class MetadataAnalyzer implements VideoAnalyzer {
  readonly id = "technical-metadata";
  readonly label = "Technical metadata";
  readonly version = "ffprobe-1";
  availability() {
    return { available: true } as const;
  }
  async analyze(input: AnalysisInput): Promise<AnalysisResult> {
    const p = await ffprobe(input.filePath);
    const fps = p.frameRate ? evalRate(p.frameRate) : null;
    return {
      data: { ...p, fps },
      limitations: ["Reports file properties only (duration, resolution, frame rate). It does not look at the movement in the video."],
    };
  }
}

function evalRate(r: string): number | null {
  const [a, b] = r.split("/").map(Number);
  return a && b ? Math.round((a / b) * 100) / 100 : null;
}

// ---------------------------------------------------------------------------
// 2. Skill recognition (external model service). Unavailable unless configured.
// ---------------------------------------------------------------------------

/**
 * HTTP adapter for an external computer-vision service (contract in docs/VIDEO_ANALYSIS.md).
 * No such model ships with this project; without VIDEO_MODEL_ENDPOINT the analyzer reports
 * itself unavailable and the UI says so. It never fabricates predictions.
 */
class ExternalSkillRecognizer implements VideoAnalyzer {
  readonly id = "skill-recognition";
  readonly label = "Skill recognition";
  readonly version = "http-contract-v1";
  availability() {
    return env().VIDEO_MODEL_ENDPOINT
      ? ({ available: true } as const)
      : ({ available: false, reason: "No skill-recognition model is connected. This feature is in development." } as const);
  }
  async analyze(input: AnalysisInput): Promise<AnalysisResult> {
    const endpoint = env().VIDEO_MODEL_ENDPOINT;
    if (!endpoint) throw new Error("Skill recognition is not configured");
    const { readFile } = await import("node:fs/promises");
    const body = new FormData();
    body.set("video", new Blob([await readFile(input.filePath)], { type: input.mimeType }), "clip");
    const res = await fetch(endpoint, {
      method: "POST",
      body,
      headers: env().VIDEO_MODEL_API_KEY ? { Authorization: `Bearer ${env().VIDEO_MODEL_API_KEY}` } : {},
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`Model service returned HTTP ${res.status}`);
    const json = (await res.json()) as { model?: string; segments?: unknown[]; limitations?: string[]; evaluation?: unknown };
    if (!Array.isArray(json.segments)) throw new Error("Model service response did not match the contract");
    return {
      data: { model: json.model ?? "unknown", segments: json.segments, evaluation: json.evaluation ?? null },
      limitations: [
        ...(json.limitations ?? []),
        "Predictions are model output, not judging or coaching. Confidence scores are not proof of correctness.",
      ],
    };
  }
}

const registry: VideoAnalyzer[] = [new MetadataAnalyzer(), new ExternalSkillRecognizer()];

export function analyzers(): VideoAnalyzer[] {
  return registry;
}
export function analyzerById(id: string) {
  return registry.find((a) => a.id === id) ?? null;
}
