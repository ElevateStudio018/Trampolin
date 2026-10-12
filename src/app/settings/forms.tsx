"use client";

import { ActionForm, Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/forms";
import { changePasswordAction, deleteAccountAction, updateProfileAction } from "./actions";

type Profile = { displayName: string; bio: string; homeClub: string; profileVisibility: string; collectionVisibility: string };

const VIS = [
  { v: "private", label: "Only me" },
  { v: "members", label: "Signed-in members" },
  { v: "public", label: "Anyone, including visitors" },
];

export function ProfileForm({ profile }: { profile: Profile }) {
  return (
    <ActionForm action={updateProfileAction} className="flex flex-col gap-4">
      {(s) => (
        <>
          <FormMessage state={s} />
          <Field label="Display name" name="displayName" error={s.fieldErrors?.displayName}>
            <Input name="displayName" defaultValue={profile.displayName} required maxLength={60} />
          </Field>
          <Field label="Home club" name="homeClub" hint="Optional.">
            <Input name="homeClub" defaultValue={profile.homeClub} maxLength={80} />
          </Field>
          <Field label="Bio" name="bio">
            <Textarea name="bio" defaultValue={profile.bio} maxLength={500} rows={3} />
          </Field>
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold">Privacy</legend>
            <Field label="Who can see my profile" name="profileVisibility">
              <Select name="profileVisibility" defaultValue={profile.profileVisibility}>
                {VIS.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Who can see my collection" name="collectionVisibility" hint="Progress notes are always private.">
              <Select name="collectionVisibility" defaultValue={profile.collectionVisibility}>
                {VIS.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          </fieldset>
          <div>
            <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function DeleteAccountForm() {
  return (
    <ActionForm action={deleteAccountAction} className="flex flex-col gap-3" refreshOnSuccess={false}>
      {(s) => (
        <>
          <FormMessage state={s} />
          <Field label="Password" name="password">
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>
          <Field label="Type DELETE to confirm" name="confirm" error={s.fieldErrors?.confirm}>
            <Input name="confirm" autoComplete="off" required />
          </Field>
          <div>
            <SubmitButton variant="danger" pendingLabel="Deleting…">Delete my account and data</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function ChangePasswordForm() {
  return (
    <ActionForm action={changePasswordAction} resetOnSuccess className="flex flex-col gap-3">
      {(s) => (
        <>
          <FormMessage state={s} />
          <Field label="Current password" name="currentPassword" error={s.fieldErrors?.currentPassword}>
            <Input name="currentPassword" type="password" autoComplete="current-password" required invalid={!!s.fieldErrors?.currentPassword} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="New password" name="newPassword" hint="At least 10 characters." error={s.fieldErrors?.newPassword}>
              <Input name="newPassword" type="password" autoComplete="new-password" required minLength={10} invalid={!!s.fieldErrors?.newPassword} />
            </Field>
            <Field label="Repeat new password" name="confirmPassword" error={s.fieldErrors?.confirmPassword}>
              <Input name="confirmPassword" type="password" autoComplete="new-password" required invalid={!!s.fieldErrors?.confirmPassword} />
            </Field>
          </div>
          <div>
            <SubmitButton variant="secondary" pendingLabel="Changing…">Change password</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
