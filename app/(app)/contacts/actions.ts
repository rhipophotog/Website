"use server";

import { withStudioDefaults } from "@/lib/messaging/studio";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { findExisting } from "@/lib/contacts/import-server";
import { defaultPipelineId, ensureTagIds, filtersSchema, matchingContacts, tagContacts } from "@/lib/contacts/queries";
import {
  consentSchema,
  contactFieldsSchema,
  contactFlagsSchema,
  formDataObject,
  noteSchema,
  quickAddExtrasSchema,
  zodFieldErrors,
  type FormState,
} from "@/lib/contacts/schema";
import { MERGEABLE_FIELDS } from "@/lib/contacts/fields";
import { emailContact } from "@/lib/messaging/email";
import { buildMergeContext } from "@/lib/messaging/render";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.uuid();

async function member() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return { user, supabase: await createClient() };
}

async function owner() {
  const ctx = await member();
  if (ctx.user.role !== "owner") throw new Error("Only the owner can do that.");
  return ctx;
}

// ---------------------------------------------------------------------------
// Quick add (with dedupe)
// ---------------------------------------------------------------------------

export async function createContact(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await member();
  const input = formDataObject(formData);
  const fields = contactFieldsSchema.safeParse(input);
  const extras = quickAddExtrasSchema.safeParse(input);
  if (!fields.success || !extras.success) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: { ...(fields.success ? {} : zodFieldErrors(fields.error)), ...(extras.success ? {} : zodFieldErrors(extras.error)) },
    };
  }

  const [match] = await findExisting(supabase, {
    emails: fields.data.email ? [fields.data.email] : [],
    phones: fields.data.phone ? [fields.data.phone] : [],
    ghlIds: [],
  });

  let contactId: string;
  if (match) {
    // SPEC §5: don't create a duplicate. Fill in what's missing and add to the existing person.
    contactId = match.id;
    // Only fields the lookup returned can be judged blank; anything else is left untouched.
    const current = match as Record<string, unknown>;
    const patch = Object.fromEntries(Object.entries(fields.data).filter(([k, v]) => v != null && k in current && current[k] == null));
    if (Object.keys(patch).length) await supabase.from("contacts").update(patch).eq("id", contactId);
  } else {
    const { data, error } = await supabase.from("contacts").insert(fields.data).select("id").single();
    if (error || !data) return { ok: false, message: "Couldn't save the contact. Try again." };
    contactId = data.id;
  }

  try {
    const tagIds = await ensureTagIds(supabase, extras.data.tags);
    await tagContacts(supabase, tagIds.map((tag_id) => ({ contact_id: contactId, tag_id })));

    if (extras.data.create_opportunity) {
      const coupleNames = [fields.data.first_name, fields.data.partner_name].filter(Boolean).join(" & ") || null;
      const { error } = await supabase.from("opportunities").insert({
        contact_id: contactId,
        pipeline_id: await defaultPipelineId(supabase),
        stage_key: "new_inquiry",
        couple_names: coupleNames,
        event_type: extras.data.event_type,
        event_dates: extras.data.event_date ? [{ name: "Wedding", date: extras.data.event_date }] : [],
        venue: extras.data.venue,
        source: fields.data.source,
      });
      if (error) throw new Error(error.message);
    }
  } catch {
    redirect(`/contacts/${contactId}?notice=partial`);
  }

  revalidatePath("/contacts");
  redirect(`/contacts/${contactId}${match ? "?notice=existing" : ""}`);
}

// ---------------------------------------------------------------------------
// Edit
// ---------------------------------------------------------------------------

export async function updateContact(contactId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await member();
  const id = idSchema.parse(contactId);
  const input = formDataObject(formData);
  const fields = contactFieldsSchema.safeParse(input);
  const flags = contactFlagsSchema.safeParse(input);
  if (!fields.success || !flags.success) {
    return { ok: false, message: "Check the highlighted fields.", fieldErrors: fields.success ? {} : zodFieldErrors(fields.error) };
  }

  const { error } = await supabase.from("contacts").update({ ...fields.data, ...flags.data }).eq("id", id);
  if (error) return { ok: false, message: "Couldn't save changes. Try again." };

  revalidatePath(`/contacts/${id}`);
  redirect(`/contacts/${id}`);
}

// ---------------------------------------------------------------------------
// Tags, notes, consent
// ---------------------------------------------------------------------------

export async function addTags(contactId: string, formData: FormData): Promise<void> {
  const { supabase } = await member();
  const id = idSchema.parse(contactId);
  const { tags } = quickAddExtrasSchema.pick({ tags: true }).parse({ tags: formData.get("tags") });
  const tagIds = await ensureTagIds(supabase, tags);
  await tagContacts(supabase, tagIds.map((tag_id) => ({ contact_id: id, tag_id })));
  revalidatePath(`/contacts/${id}`);
}

export async function removeTag(contactId: string, tagId: string): Promise<void> {
  const { supabase } = await member();
  await supabase.from("contact_tags").delete().eq("contact_id", idSchema.parse(contactId)).eq("tag_id", idSchema.parse(tagId));
  revalidatePath(`/contacts/${contactId}`);
}

export async function addNote(contactId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await member();
  const id = idSchema.parse(contactId);
  const parsed = noteSchema.safeParse({ body: formData.get("body") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { error } = await supabase
    .from("messages")
    .insert({ contact_id: id, channel: "note", direction: "internal", body: parsed.data.body });
  if (error) return { ok: false, message: "Couldn't save the note." };
  revalidatePath(`/contacts/${id}`);
  return { ok: true, message: "Note added." };
}

export async function recordConsent(contactId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await member();
  const id = idSchema.parse(contactId);
  const parsed = consentSchema.safeParse(formDataObject(formData));
  if (!parsed.success) return { ok: false, message: "Check the consent details.", fieldErrors: zodFieldErrors(parsed.error) };
  const { error } = await supabase.from("consents").insert({ contact_id: id, ...parsed.data });
  if (error) return { ok: false, message: "Couldn't record consent." };
  revalidatePath(`/contacts/${id}`);
  return { ok: true, message: parsed.data.granted ? "Consent recorded." : "Opt-out recorded." };
}

// ---------------------------------------------------------------------------
// Delete (owner, SPEC §12: hard delete on request) and merge
// ---------------------------------------------------------------------------

export async function deleteContact(contactId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await owner();
  const id = idSchema.parse(contactId);
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") {
    return { ok: false, message: 'Type DELETE to confirm.' };
  }
  const { data, error } = await supabase.from("contacts").delete().eq("id", id).select("id");
  if (error || !data?.length) return { ok: false, message: "Couldn't delete the contact." };
  // No name/email in the audit entry: the point of the request is that we stop holding them.
  await supabase.from("audit_log").insert({ action: "contact.deleted", entity: "contacts", entity_id: id, actor_id: user.id });
  revalidatePath("/contacts");
  redirect("/contacts?notice=deleted");
}

const mergeSchema = z.object({
  primary: z.uuid(),
  duplicate: z.uuid(),
  take: z.array(z.enum(MERGEABLE_FIELDS.map((f) => f.key) as [string, ...string[]])),
});

export async function mergeContacts(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await owner();
  const primary = String(formData.get("primary") ?? "");
  const other = String(formData.get("other") ?? "");
  const keep = String(formData.get("keep") ?? primary);
  // "keep" chooses which record survives; per-field radios say where each value comes from.
  const survivor = keep === other ? other : primary;
  const duplicate = survivor === primary ? other : primary;
  const take = MERGEABLE_FIELDS.map((f) => f.key).filter((key) => {
    const from = formData.get(`field_${key}`);
    return from === (survivor === primary ? "other" : "primary");
  });

  const parsed = mergeSchema.safeParse({ primary: survivor, duplicate, take });
  if (!parsed.success) return { ok: false, message: "Something's off with this merge. Reload and try again." };

  const { error } = await supabase.rpc("merge_contacts", {
    p_primary: parsed.data.primary,
    p_duplicate: parsed.data.duplicate,
    p_take: parsed.data.take,
  });
  if (error) {
    return {
      ok: false,
      message: /duplicate key/.test(error.message)
        ? "Those two contacts can't both keep the same GoHighLevel id. Pick one."
        : "Couldn't merge these contacts.",
    };
  }
  revalidatePath("/contacts");
  redirect(`/contacts/${parsed.data.primary}?notice=merged`);
}

// ---------------------------------------------------------------------------
// Saved views
// ---------------------------------------------------------------------------

export async function saveView(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await member();
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  if (!name) return { ok: false, message: "Name the view." };
  const filters = filtersSchema.omit({ page: true }).parse(formDataObject(formData));
  const { error } = await supabase.from("saved_views").insert({ name, filters, shared: formData.get("shared") === "on" });
  if (error) return { ok: false, message: "Couldn't save the view." };
  revalidatePath("/contacts");
  return { ok: true, message: `Saved "${name}".` };
}

export async function deleteView(viewId: string): Promise<void> {
  const { supabase } = await member();
  await supabase.from("saved_views").delete().eq("id", idSchema.parse(viewId));
  revalidatePath("/contacts");
}

// ---------------------------------------------------------------------------
// Bulk add to pipeline (owner): every contact matching the current filters
// ---------------------------------------------------------------------------

export async function bulkAddToPipeline(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await owner();
  const filters = filtersSchema.parse({ ...formDataObject(formData), page: 1 });
  const stageKey = z.string().regex(/^[a-z][a-z0-9_]*$/).safeParse(formData.get("stage_key"));
  if (!stageKey.success || stageKey.data === "lost") return { ok: false, message: "Pick a stage (not Lost)." };

  const contacts = await matchingContacts(supabase, filters);
  // Skip anyone already in the pipeline, so running it twice doesn't create duplicates.
  const toAdd = contacts.filter((c) => c.stage_keys.length === 0);
  if (toAdd.length === 0) return { ok: true, message: "Everyone matching is already in the pipeline." };

  const pipeline_id = await defaultPipelineId(supabase);
  for (let i = 0; i < toAdd.length; i += 500) {
    const { error } = await supabase.from("opportunities").insert(
      toAdd.slice(i, i + 500).map((c) => ({
        contact_id: c.id,
        pipeline_id,
        stage_key: stageKey.data,
        couple_names: [c.first_name, c.partner_name].filter(Boolean).join(" & ") || null,
        source: c.source,
      })),
    );
    if (error) return { ok: false, message: `Added ${i} before an error. Try again; already-added contacts are skipped.` };
  }

  revalidatePath("/contacts");
  revalidatePath("/pipeline");
  const skipped = contacts.length - toAdd.length;
  return { ok: true, message: `Added ${toAdd.length} to the pipeline${skipped ? ` (${skipped} were already in it)` : ""}.` };
}

// ---------------------------------------------------------------------------
// Email from the contact page
// ---------------------------------------------------------------------------

const emailFormSchema = z.object({
  subject: z.string().trim().min(1, "Add a subject.").max(300),
  body: z.string().trim().min(1, "Write a message.").max(20_000),
  template_key: z.string().regex(/^[a-z][a-z0-9_]*$/).optional().or(z.literal("")),
  in_reply_to: z.string().max(500).optional().or(z.literal("")),
});

export async function sendEmailToContact(contactId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await member();
  const id = idSchema.parse(contactId);
  const parsed = emailFormSchema.safeParse(formDataObject(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the email." };

  const [{ data: contact }, { data: opportunity }, { data: settings }, template] = await Promise.all([
    supabase.from("contacts").select("id, first_name, partner_name, email, dnd_email, email_marketing_consent").eq("id", id).single(),
    supabase.from("opportunities").select("event_dates, venue, city").eq("contact_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("studio_settings").select("*").single(),
    parsed.data.template_key
      ? supabase.from("templates").select("category").eq("key", parsed.data.template_key).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!contact) return { ok: false, message: "Contact not found." };

  const outcome = await emailContact(supabase, {
    contact,
    subject: parsed.data.subject,
    body: parsed.data.body,
    category: (template.data?.category as "transactional" | "marketing" | undefined) ?? "transactional",
    templateKey: parsed.data.template_key || null,
    inReplyTo: parsed.data.in_reply_to || null,
    context: buildMergeContext({ contact, opportunity, settings: withStudioDefaults(settings) }),
    authorId: user.id,
  });

  revalidatePath(`/contacts/${id}`);
  revalidatePath("/inbox");
  switch (outcome.status) {
    case "sent":
      return { ok: true, message: "Sent." };
    case "test":
      return { ok: true, message: "Saved as a test email: real sending starts once email is set up (production)." };
    case "skipped":
      return {
        ok: false,
        message: {
          no_email: "This contact has no email address.",
          dnd_email: "This contact is marked Do not email.",
          marketing_opt_out: "They've opted out of marketing emails.",
          duplicate: "That email was already sent.",
        }[outcome.reason],
      };
    default:
      return { ok: false, message: `Couldn't send: ${outcome.error}` };
  }
}

export async function markConversationRead(contactId: string): Promise<void> {
  const { supabase } = await member();
  await supabase.rpc("mark_conversation_read", { p_contact_id: idSchema.parse(contactId) });
  revalidatePath("/inbox");
}
