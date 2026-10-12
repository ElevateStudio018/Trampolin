# Video analysis: model boundary and evaluation requirements

## Current state

| Analyzer | Status | What it does |
| --- | --- | --- |
| `technical-metadata` (`ffprobe-1`) | Working | Duration, resolution, frame rate and codec, read with ffprobe. It does not look at movement. |
| `skill-recognition` (`http-contract-v1`) | **Unavailable** unless `VIDEO_MODEL_ENDPOINT` is set | Sends the clip to an external model service. No model ships with this project. |

When skill recognition is unavailable, a request records an `unavailable` analysis with an explanation. No prediction is ever generated or displayed.

## Adding a model

Implement `VideoAnalyzer` in `src/server/video/analyzers.ts` and add it to the registry:

```ts
interface VideoAnalyzer {
  id: string;            // stable identifier stored with results
  label: string;
  version: string;       // stored with every result; bump when outputs change
  availability(): { available: true } | { available: false; reason: string };
  analyze(input: { videoId: string; filePath: string; mimeType: string }): Promise<{
    data: Record<string, unknown>;
    limitations: string[]; // required, shown next to the result
  }>;
}
```

## HTTP contract for `skill-recognition`

`POST $VIDEO_MODEL_ENDPOINT` as `multipart/form-data` with field `video`. The header `Authorization: Bearer $VIDEO_MODEL_API_KEY` is sent if that variable is set. Timeout 120 s.

Response `200 application/json`:

```json
{
  "model": "name@version",
  "segments": [{ "start_ms": 0, "end_ms": 1200, "label": "barani", "confidence": 0.71 }],
  "limitations": ["Trained on competition footage filmed side-on only"],
  "evaluation": { "dataset": "…", "test_split_size": 0, "top1_accuracy": 0.0, "report_url": "…" }
}
```

Any other status code or shape marks the analysis `failed` with the error message. The app always appends a limitation stating that confidence is not proof of correctness.

## Requirements before enabling a real model

1. **Authorised data only.** Use only clips whose owners opted in (`videos.training_consent = true`) or datasets licensed for this use. Do not scrape or download third-party media.
2. **Split by performance and athlete, not by clip.** Repeated recordings of the same routine, re-encodes and near-duplicate clips (use `videos.sha256` plus perceptual hashing) must all land in the same split. Otherwise test accuracy is inflated by leakage.
3. **Separate train / validation / test sets.** Tune only on validation, and report test results once per model version.
4. **Report measured performance honestly**: per-class precision and recall, the confusion between similar skills (barani vs rudolph, ball out vs barani ball out), and performance by camera angle and lighting. Put the numbers in the `evaluation` field so the UI can link to them.
5. **No safety or completion predictions.** The product must not claim to judge landing safety or the probability that someone can complete a skill.
