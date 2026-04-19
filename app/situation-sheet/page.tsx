import { redirect } from "next/navigation";

export default function SituationSheetIndex() {
  // Redirect to the monitor page — individual sheets are accessed by clicking incidents
  redirect("/");
}
