import { AppShell } from "@/components/AppShell";
import { NoteCard } from "@/components/NoteCard";
import { NoteComposer } from "@/components/NoteComposer";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";

export const metadata = { title: "Your desk" };

export default async function DashboardPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already redirects unauthenticated users; this is a safety net.
  if (!user) return null;

  const { data: notes } = await supabase
    .from("notes")
    .select("id, body, created_at, status, sender_id, recipient_id")
    .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(40);

  const items =
    notes?.map((n) => ({
      id: n.id,
      body: n.body,
      created_at: n.created_at,
      status: n.status,
      direction:
        n.sender_id === user.id
          ? ("outgoing" as const)
          : ("incoming" as const),
    })) ?? [];

  return (
    <AppShell>
      <header className="mb-8 flex flex-col gap-1">
        <span className="text-xs uppercase tracking-[0.2em] text-plum-200">
          Your desk
        </span>
        <h1 className="font-serif text-3xl md:text-4xl">
          {greeting()},{" "}
          <span className="italic text-rose-300">
            {user.email?.split("@")[0] ?? "love"}
          </span>
        </h1>
        <p className="text-sm text-plum-300">
          Leave a little something. It will quietly appear on their desk.
        </p>
      </header>

      <NoteComposer />

      <section className="mt-10">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-plum-300">
          Recent notes
        </h2>

        {items.length === 0 ? (
          <Card>
            <CardTitle>No notes yet</CardTitle>
            <CardDescription>
              When you send or receive a note, it will appear here — gently.
            </CardDescription>
          </Card>
        ) : (
          <div className="grid gap-3">
            {items.map((note) => (
              <NoteCard key={note.id} note={note} />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
