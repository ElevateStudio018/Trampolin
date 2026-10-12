"use client";

import Link from "next/link";
import { ActionForm, Field, FormMessage, Input, SubmitButton } from "@/components/forms";
import { signInAction, signUpAction } from "../actions-auth";

export function SignInForm({ next }: { next: string }) {
  return (
    <ActionForm action={signInAction} className="flex flex-col gap-4" refreshOnSuccess={false}>
      {(s) => (
        <>
          <FormMessage state={s} />
          <input type="hidden" name="next" value={next} />
          <Field label="Email" name="email" error={s.fieldErrors?.email}>
            <Input name="email" type="email" autoComplete="email" required defaultValue={s.values?.email} />
          </Field>
          <Field label="Password" name="password" error={s.fieldErrors?.password}>
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>
          <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
          <p className="text-center text-sm text-muted">
            New here?{" "}
            <Link href="/signup" className="font-medium text-accent hover:underline">
              Create an account
            </Link>
          </p>
        </>
      )}
    </ActionForm>
  );
}

export function SignUpForm() {
  return (
    <ActionForm action={signUpAction} className="flex flex-col gap-4" refreshOnSuccess={false}>
      {(s) => (
        <>
          <FormMessage state={s} />
          <Field label="Display name" name="displayName" error={s.fieldErrors?.displayName}>
            <Input name="displayName" autoComplete="name" required maxLength={60} defaultValue={s.values?.displayName} invalid={!!s.fieldErrors?.displayName} />
          </Field>
          <Field label="Handle" name="handle" hint="Shown on your profile URL. Letters, numbers and underscores." error={s.fieldErrors?.handle}>
            <Input name="handle" autoComplete="username" required maxLength={24} defaultValue={s.values?.handle} invalid={!!s.fieldErrors?.handle} />
          </Field>
          <Field label="Email" name="email" error={s.fieldErrors?.email}>
            <Input name="email" type="email" autoComplete="email" required defaultValue={s.values?.email} invalid={!!s.fieldErrors?.email} />
          </Field>
          <Field label="Password" name="password" hint="At least 10 characters." error={s.fieldErrors?.password}>
            <Input name="password" type="password" autoComplete="new-password" required minLength={10} invalid={!!s.fieldErrors?.password} />
          </Field>
          <p className="text-xs text-muted">Your profile is visible to signed-in members by default, and your collection and notes start private. You can change this in settings.</p>
          <SubmitButton pendingLabel="Creating account…">Create account</SubmitButton>
          <p className="text-center text-sm text-muted">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-accent hover:underline">
              Sign in
            </Link>
          </p>
        </>
      )}
    </ActionForm>
  );
}
