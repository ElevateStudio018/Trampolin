"use client";

import { useState } from "react";
import { ActionForm, FormMessage, Select, SubmitButton, Textarea } from "@/components/forms";
import { buttonClass } from "@/components/ui";
import { reportAction } from "./actions";

export function ReportButton({ targetType, targetId }: { targetType: "post" | "comment" | "video" | "profile"; targetId: string }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("ghost", "sm", "text-muted")}>
        Report
      </button>
    );
  return (
    <ActionForm action={reportAction} refreshOnSuccess={false} className="flex w-full max-w-sm flex-col gap-2 rounded-[var(--radius-control)] border border-line bg-surface p-3">
      {(s) =>
        s.ok ? (
          <FormMessage state={s} />
        ) : (
          <>
            <FormMessage state={s} />
            <input type="hidden" name="targetType" value={targetType} />
            <input type="hidden" name="targetId" value={targetId} />
            <label className="text-sm font-medium" htmlFor={`reason-${targetId}`}>
              Why are you reporting this?
            </label>
            <Select name="reason" id={`reason-${targetId}`} defaultValue="spam">
              <option value="spam">Spam</option>
              <option value="harassment">Harassment or abuse</option>
              <option value="dangerous">Dangerous or unsafe content</option>
              <option value="privacy">Privacy concern</option>
              <option value="copyright">Copyright</option>
              <option value="other">Other</option>
            </Select>
            <Textarea name="details" rows={2} maxLength={1000} placeholder="Details (optional)" aria-label="Details" />
            <div className="flex gap-2">
              <SubmitButton size="sm" variant="danger">Send report</SubmitButton>
              <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          </>
        )
      }
    </ActionForm>
  );
}
