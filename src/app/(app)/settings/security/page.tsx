import { redirect } from "next/navigation";

export default function SecurityRedirect() {
  redirect("/settings?recovery=1#security");
}
