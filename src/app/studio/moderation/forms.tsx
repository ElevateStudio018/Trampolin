"use client";

import { ActionButton, ActionForm, FormMessage, Input, Select, SubmitButton } from "@/components/forms";
import { resolveReportAction, setRoleAction, suspendAction } from "../actions";

export function ResolveForm({ reportId, hidden }: { reportId: string; hidden: boolean }) {
  return (
    <ActionForm action={resolveReportAction} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      {(s) => (
        <>
          <FormMessage state={s} />
          <input type="hidden" name="reportId" value={reportId} />
          <label className="sr-only" htmlFor={`note-${reportId}`}>Note</label>
          <Input id={`note-${reportId}`} name="note" placeholder="Note (optional)" className="h-8 text-sm sm:w-56" />
          <SubmitButton name="action" value={hidden ? "restore" : "hide"} size="sm" variant={hidden ? "secondary" : "danger"}>
            {hidden ? "Restore" : "Hide content"}
          </SubmitButton>
          <SubmitButton name="action" value="dismiss" size="sm" variant="ghost">
            Dismiss
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function RoleForm({ userId, role }: { userId: string; role: string }) {
  return (
    <ActionForm action={setRoleAction} className="flex items-center gap-2">
      {(s) => (
        <>
          <input type="hidden" name="userId" value={userId} />
          <label className="sr-only" htmlFor={`role-${userId}`}>Role</label>
          <Select id={`role-${userId}`} name="role" defaultValue={role} className="h-8 w-32 text-sm">
            <option value="member">member</option>
            <option value="reviewer">reviewer</option>
            <option value="admin">admin</option>
          </Select>
          <SubmitButton size="sm" variant="secondary">Set</SubmitButton>
          {!s.ok && s.message && <span className="text-xs text-danger">{s.message}</span>}
        </>
      )}
    </ActionForm>
  );
}

export function SuspendButton({ userId, suspended }: { userId: string; suspended: boolean }) {
  return (
    <ActionButton action={suspendAction} fields={{ userId, suspend: suspended ? "0" : "1" }} variant={suspended ? "secondary" : "danger"} confirm={suspended ? undefined : "Suspend this user? They are signed out everywhere."}>
      {suspended ? "Unsuspend" : "Suspend"}
    </ActionButton>
  );
}
