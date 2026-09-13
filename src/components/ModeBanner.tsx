import { env } from "@/lib/env";

/**
 * Makes the send mode impossible to miss. Confusing mock sends for real ones
 * (or the reverse) is the expensive mistake in a tool like this.
 */
export function ModeBanner() {
  if (env.mock) {
    return (
      <div className="banner banner-mock">
        <span aria-hidden="true">⚠</span>
        <span>
          <strong>Mock mode.</strong> Sends are simulated and nothing reaches WhatsApp. Set{" "}
          <code>WHATSAPP_MOCK=false</code> with real credentials once Meta has verified your
          business and approved your templates.
        </span>
      </div>
    );
  }
  return (
    <div className="banner banner-live">
      <span aria-hidden="true">●</span>
      <span>
        <strong>Live.</strong> Messages sent from here reach real people and are billed by Meta.
      </span>
    </div>
  );
}
