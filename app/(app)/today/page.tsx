import { permanentRedirect } from "next/navigation";

export default function TodayPage() {
  permanentRedirect("/dashboard");
}
