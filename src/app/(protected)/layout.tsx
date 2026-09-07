import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (!userId) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, position")
    .eq("id", userId)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-slate-100 lg:flex">
      <AppSidebar
        fullName={profile?.full_name ?? "Usuario"}
        role={profile?.role ?? "sin rol"}
        position={profile?.position ?? "sin cargo"}
      />
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
