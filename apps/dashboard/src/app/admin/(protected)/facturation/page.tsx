import { redirect } from "next/navigation";

/** L'abonnement n'existe plus : les anciens liens/favoris reviennent à l'accueil. */
export default function FacturationRedirect(): never {
  redirect("/admin");
}
