import { redirect } from "next/navigation";

// Legacy iframe page replaced by /phone-calls. Anything still pointing here
// (DemoController history, bookmarks, the old top-nav label) lands on the
// canonical Twilio monitor instead of a dead/duplicate view.
export default function DispatchLiveRedirect() {
  redirect("/phone-calls");
}
