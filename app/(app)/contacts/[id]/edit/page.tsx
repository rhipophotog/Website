import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { updateContact } from "../../actions";
import { ContactForm } from "../../contact-form";

export const metadata: Metadata = { title: "Edit contact" };

export default async function EditContactPage({ params }: PageProps<"/contacts/[id]/edit">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: contact } = await supabase.from("contacts").select("*").eq("id", id).maybeSingle();
  if (!contact) notFound();

  return (
    <>
      <PageHeader title="Edit contact" />
      <ContactForm mode="edit" action={updateContact.bind(null, id)} values={contact} />
    </>
  );
}
