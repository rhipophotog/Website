import { fetchReceivedEmail } from "./providers/resend";

/** Reading an inbound email from the provider (receiving only; sending goes through sendEmail). */
export async function getReceivedEmail(apiKey: string, emailId: string) {
  return fetchReceivedEmail(apiKey, emailId);
}
