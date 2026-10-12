"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { type ActionState, initialActionState } from "@/lib/action-state";
import { buttonClass } from "./ui";

/** Pending state of the surrounding ActionForm, for forms submitted via a transition. */
const PendingContext = createContext(false);

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { pendingLabel?: string; variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" }) {
  const status = useFormStatus();
  const contextPending = useContext(PendingContext);
  const pending = status.pending || contextPending;
  return (
    <button type="submit" disabled={pending || props.disabled} aria-busy={pending} className={buttonClass(variant, size, className)} {...props}>
      {pending && <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />}
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}

const control =
  "w-full rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 text-[15px] text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 aria-[invalid=true]:border-danger";

export function Field({ label, name, hint, error, children, className, htmlFor }: { label: string; name: string; hint?: ReactNode; error?: string[]; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor ?? name} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && !error?.length && (
        <p id={`${name}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error?.length ? (
        <p id={`${name}-error`} className="text-xs font-medium text-danger">
          {error.join(" ")}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className, invalid, ...props }: ComponentProps<"input"> & { invalid?: boolean }) {
  return <input id={props.name} aria-invalid={invalid || undefined} aria-describedby={invalid ? `${props.name}-error` : undefined} className={cn(control, "h-10", className)} {...props} />;
}

export function Textarea({ className, invalid, ...props }: ComponentProps<"textarea"> & { invalid?: boolean }) {
  return <textarea id={props.name} aria-invalid={invalid || undefined} className={cn(control, "min-h-24 py-2 leading-relaxed", className)} {...props} />;
}

export function Select({ className, invalid, ...props }: ComponentProps<"select"> & { invalid?: boolean }) {
  return <select id={props.name} aria-invalid={invalid || undefined} className={cn(control, "h-10 pr-8", className)} {...props} />;
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={cn("rounded-[var(--radius-control)] px-3 py-2 text-sm", state.ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger")}>
      {state.message}
    </p>
  );
}

/**
 * Form bound to a server action with useActionState. Renders children via a render
 * prop so fields can read errors and echoed values.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  refreshOnSuccess = true,
  ...props
}: Omit<ComponentProps<"form">, "action" | "children"> & {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: (state: ActionState) => ReactNode;
  resetOnSuccess?: boolean;
  refreshOnSuccess?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (!state.ok) return;
    if (state.redirectTo) router.push(state.redirectTo);
    else if (refreshOnSuccess) router.refresh();
    if (resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess, refreshOnSuccess, router]);
  return (
    <PendingContext.Provider value={isPending}>
      <form
        ref={ref}
        // Without JavaScript the form still posts to the server action.
        action={formAction}
        // With JavaScript, dispatch manually: React 19 resets a form after an action passed via
        // the `action` prop, which snaps <select> elements back to stale defaults. Forms that
        // should clear opt in with resetOnSuccess.
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
          startTransition(() => formAction(fd));
        }}
        className={className}
        noValidate
        {...props}
      >
        {children(state)}
      </form>
    </PendingContext.Provider>
  );
}

/** One-click action button (e.g. save, like) with pending state, no visible form chrome. */
export function ActionButton({
  action,
  fields,
  children,
  pendingLabel,
  variant = "secondary",
  size = "sm",
  className,
  confirm,
  ariaLabel,
  ariaPressed,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  children: ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  className?: string;
  confirm?: string;
  ariaLabel?: string;
  ariaPressed?: boolean;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  const router = useRouter();
  useEffect(() => {
    if (state.ok && state.redirectTo) router.push(state.redirectTo);
    else if (state.ok) router.refresh();
  }, [state, router]);
  return (
    <form
      action={formAction}
      className="inline-flex flex-col items-start gap-1"
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton variant={variant} size={size} pendingLabel={pendingLabel} className={className} aria-label={ariaLabel} aria-pressed={ariaPressed}>
        {children}
      </SubmitButton>
      {!state.ok && state.message && (
        <span role="alert" className="text-xs text-danger">
          {state.message}
        </span>
      )}
    </form>
  );
}
