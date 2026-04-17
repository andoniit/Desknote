import { AppShell } from "@/components/AppShell";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { signOut } from "@/app/actions/auth";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return (
    <AppShell>
      <header className="mb-8 flex flex-col gap-1">
        <span className="text-xs uppercase tracking-[0.2em] text-plum-200">
          Settings
        </span>
        <h1 className="font-serif text-3xl md:text-4xl">
          Just the <span className="italic text-rose-300">essentials</span>
        </h1>
      </header>

      <div className="grid gap-4">
        <Card>
          <CardTitle>Account</CardTitle>
          <CardDescription>Signed in as {user.email}</CardDescription>
        </Card>

        <Card>
          <CardTitle>Pair with your partner</CardTitle>
          <CardDescription>
            Share your pairing link so only the two of you can exchange notes.
          </CardDescription>
          <div className="mt-4">
            <Button variant="secondary">Copy pairing link</Button>
          </div>
        </Card>

        <Card>
          <CardTitle>Sign out</CardTitle>
          <CardDescription>
            You can come back whenever you like.
          </CardDescription>
          <form action={signOut} className="mt-4">
            <Button variant="ghost" type="submit">
              Sign out
            </Button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
