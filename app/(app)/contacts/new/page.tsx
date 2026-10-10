import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { createContact } from "../actions";
import { ContactForm } from "../contact-form";

export const metadata: Metadata = { title: "Add contact" };

export default function NewContactPage() {
  return (
    <>
      <PageHeader title="Add contact" description="If they're already in your contacts (same email or phone), we'll add to that record instead." />
      <ContactForm mode="create" action={createContact} />
    </>
  );
}
