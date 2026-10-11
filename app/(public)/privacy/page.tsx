import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME, STUDIO_CONTACT_EMAIL, STUDIO_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: "Privacy policy", robots: { index: true, follow: true } };

const UPDATED = "October 11, 2026";

export default function PrivacyPage() {
  return (
    <article className="space-y-6 leading-relaxed [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Privacy policy</h1>
        <p className="mt-1 text-sm text-muted">Last updated {UPDATED}</p>
      </header>

      <p>
        {APP_NAME} (&ldquo;the app&rdquo;) is the private client-management app of {STUDIO_NAME} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). This policy
        explains what information the app collects, how we use it, and the choices you have. Questions:{" "}
        <a href={`mailto:${STUDIO_CONTACT_EMAIL}`} className="text-accent underline">
          {STUDIO_CONTACT_EMAIL}
        </a>
        .
      </p>

      <h2>Who uses the app</h2>
      <p>
        Only members of our studio team can sign in. Couples and clients interact with it only through our public inquiry form, booking pages and the
        emails or text messages we send.
      </p>

      <h2>Information about clients</h2>
      <ul>
        <li>
          <strong>What you give us:</strong> name and partner&apos;s name, email, phone number, event date and venue, and anything you write in an inquiry or
          booking form.
        </li>
        <li>
          <strong>Messages:</strong> emails and text messages between you and the studio.
        </li>
        <li>
          <strong>Consent records:</strong> if you agree to receive text messages, we store when you agreed, where, and the exact wording you saw. Reply STOP
          at any time to stop texts.
        </li>
        <li>
          <strong>Technical data:</strong> a one-way hash of your IP address to prevent spam. We use Cloudflare Turnstile to block bots on our forms.
        </li>
        <li>
          <strong>Ad leads:</strong> if you fill in a lead form on Meta (Facebook/Instagram) or Google Ads, we receive the details you submitted there.
        </li>
      </ul>
      <p>
        We use this information only to reply to you, schedule calls, provide our photography and cinematography services, and send messages you agreed to.
        We never sell it or share it for advertising.
      </p>

      <h2>Google user data</h2>
      <p>
        The studio owner may connect their own Google account so the app can keep the booking calendar in sync. When they do, the app requests these
        permissions:
      </p>
      <ul>
        <li>
          <strong>Your email address</strong> (openid, email): to show which Google account is connected.
        </li>
        <li>
          <strong>Free/busy information</strong> (calendar.freebusy): to see when the owner is busy, so the booking page only offers open times. The app sees
          busy time ranges only, not event titles, attendees or descriptions.
        </li>
        <li>
          <strong>Calendar events</strong> (calendar.events): to create an event when a client books a call, and to move or delete that event when the
          booking is rescheduled or cancelled. The app only changes events it created.
        </li>
      </ul>
      <p>
        <strong>How it&apos;s stored:</strong> the access and refresh tokens Google issues are encrypted (AES-256-GCM) and stored in our database. They are
        never shown in the app or sent to a browser. Free/busy times are used at the moment a booking page loads and are not stored.
      </p>
      <p>
        <strong>Sharing:</strong> Google user data is not shared with anyone, not sold, not used for advertising, and not used to train AI or machine-learning
        models. It is only processed by the service providers that host the app (listed below), solely to run it.
      </p>
      <p>
        <strong>Limited Use:</strong> {APP_NAME}&apos;s use and transfer of information received from Google APIs adheres to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-accent underline">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>
      <p>
        <strong>Removing access:</strong> the owner can press &ldquo;Disconnect&rdquo; in Settings → Calendar at any time. This revokes the app&apos;s access
        at Google and deletes the stored tokens immediately. Access can also be removed at{" "}
        <a href="https://myaccount.google.com/permissions" className="text-accent underline">
          myaccount.google.com/permissions
        </a>
        .
      </p>

      <h2>Service providers</h2>
      <p>We use these companies to run the app. They process data only on our behalf:</p>
      <ul>
        <li>Vercel (hosting) and Supabase (database and sign-in)</li>
        <li>Resend (sending and receiving email) and Twilio (text messages)</li>
        <li>Cloudflare Turnstile (spam protection on forms)</li>
        <li>Google (calendar sync, if connected) and Meta and Google Ads (lead forms you choose to fill in)</li>
      </ul>

      <h2>Cookies</h2>
      <p>The app uses only the cookies needed to keep studio team members signed in. There are no advertising or tracking cookies.</p>

      <h2>How long we keep data</h2>
      <p>
        We keep client records while we&apos;re working together and for a reasonable time afterwards for our business records. Google tokens are kept only
        while the calendar is connected.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Unsubscribe from marketing email with the link in any of those emails.</li>
        <li>Reply STOP to any text message to stop texts.</li>
        <li>
          Email{" "}
          <a href={`mailto:${STUDIO_CONTACT_EMAIL}`} className="text-accent underline">
            {STUDIO_CONTACT_EMAIL}
          </a>{" "}
          to see, correct or delete the information we hold about you. We&apos;ll respond within 30 days.
        </li>
      </ul>

      <h2>Security</h2>
      <p>Data is encrypted in transit (HTTPS), access is restricted to the studio team, and every database table is protected by row-level security.</p>

      <h2>Children</h2>
      <p>The app isn&apos;t meant for anyone under 16, and we don&apos;t knowingly collect their information.</p>

      <h2>Changes</h2>
      <p>If we change this policy, we&apos;ll update the date at the top of this page.</p>

      <p className="text-sm text-muted">
        See also our{" "}
        <Link href="/terms" className="underline">
          terms of service
        </Link>
        .
      </p>
    </article>
  );
}
