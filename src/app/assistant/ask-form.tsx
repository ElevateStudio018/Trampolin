"use client";

import { ActionForm, FormMessage, SubmitButton } from "@/components/forms";
import { askAction } from "./actions";

const EXAMPLES = ["What is a barani?", "What's the difference between a ball out and a cody?", "How is a trampoline routine scored?", "What does 41/ mean in FIG notation?"];

export function AskForm() {
  return (
    <ActionForm action={askAction} refreshOnSuccess={false} className="flex flex-col gap-3">
      {(s) => (
        <>
          <FormMessage state={s} />
          <label htmlFor="question" className="sr-only">
            Your question
          </label>
          <textarea
            id="question"
            name="question"
            required
            minLength={3}
            maxLength={500}
            rows={3}
            defaultValue={s.values?.question}
            placeholder="Ask about a skill, a term or competition rules…"
            className="w-full rounded-[var(--radius-card)] border border-line-strong bg-surface px-4 py-3 text-[15px] leading-relaxed focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-ink-2 hover:bg-line"
                  onClick={(e) => {
                    const ta = e.currentTarget.form?.elements.namedItem("question") as HTMLTextAreaElement | null;
                    if (ta) {
                      ta.value = q;
                      ta.focus();
                    }
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
            <SubmitButton pendingLabel="Searching the Trick Book…">Ask</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
