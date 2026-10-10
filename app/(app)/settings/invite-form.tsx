"use client";

import { useActionState } from "react";
import { inviteMember, type InviteState } from "./actions";

export function InviteForm() {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteMember, null);

  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          name="email"
          type="email"
          required
          placeholder="teammate@example.com"
          aria-label="Email to invite"
          className="min-h-11 flex-1 rounded-lg border border-line bg-paper px-3 text-base outline-none focus:border-accent"
        />
        <select name="role" aria-label="Role" defaultValue="team" className="min-h-11 rounded-lg border border-line bg-paper px-3">
          <option value="team">Team member</option>
          <option value="owner">Owner</option>
        </select>
        <button disabled={pending} className="min-h-11 rounded-lg bg-accent px-4 font-medium text-accent-ink disabled:opacity-60">
          {pending ? "Inviting…" : "Invite"}
        </button>
      </div>
      {state && (
        <p role="status" className={`text-sm ${state.ok ? "text-muted" : "text-danger"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
