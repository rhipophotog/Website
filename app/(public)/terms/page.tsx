import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME, STUDIO_CONTACT_EMAIL, STUDIO_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: "Terms of service", robots: { index: true, follow: true } };

export default function TermsPage() {
  return (
    <article className="space-y-6 leading-relaxed [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Terms of service</h1>
        <p className="mt-1 text-sm text-muted">Last updated October 11, 2026</p>
      </header>

      <p>
        {APP_NAME} is operated by {STUDIO_NAME}. By using our inquiry form or booking pages, you agree to these terms.
      </p>

      <h2>Using the booking pages</h2>
      <p>
        Please give accurate details when you send an inquiry or book a call. A booked call is a free conversation about your event, not a contract for
        services. Your photography or cinematography booking is confirmed only by a separate signed agreement.
      </p>

      <h2>Rescheduling and cancelling</h2>
      <p>You can reschedule or cancel a call at any time before it starts, using the link in your confirmation email.</p>

      <h2>Messages</h2>
      <p>
        If you agree to receive text messages, message frequency varies and message and data rates may apply. Reply STOP to opt out or HELP for help. You can
        unsubscribe from marketing email at any time.
      </p>

      <h2>Studio access</h2>
      <p>Only invited members of the studio team may sign in to the app. Don&apos;t attempt to access accounts or data that aren&apos;t yours.</p>

      <h2>Privacy</h2>
      <p>
        How we handle your information is explained in our{" "}
        <Link href="/privacy" className="text-accent underline">
          privacy policy
        </Link>
        .
      </p>

      <h2>No warranty</h2>
      <p>
        The app is provided as is. We do our best to keep it available and accurate, but we&apos;re not liable for missed messages or scheduling errors
        beyond what the law requires.
      </p>

      <h2>Contact</h2>
      <p>
        <a href={`mailto:${STUDIO_CONTACT_EMAIL}`} className="text-accent underline">
          {STUDIO_CONTACT_EMAIL}
        </a>
      </p>
    </article>
  );
}
