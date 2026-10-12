/** Shape returned by every server action used with useActionState. */
export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Echo of submitted values so forms can re-populate after a validation error. */
  values?: Record<string, string>;
  redirectTo?: string;
};

export const initialActionState: ActionState = { ok: false };
