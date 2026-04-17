import { AppShell } from "@/components/AppShell";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { formatRelativeTime } from "@/lib/utils";

export const metadata = { title: "Devices" };

export default async function DevicesPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: devices } = await supabase
    .from("devices")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });

  return (
    <AppShell>
      <header className="mb-8 flex flex-col gap-1">
        <span className="text-xs uppercase tracking-[0.2em] text-plum-200">
          Devices
        </span>
        <h1 className="font-serif text-3xl md:text-4xl">
          Two desks,{" "}
          <span className="italic text-rose-300">one conversation</span>
        </h1>
        <p className="text-sm text-plum-300">
          Manage the ESP32 displays sitting on your desks.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {(devices ?? []).map((d) => (
          <Card key={d.id} className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{d.name}</CardTitle>
                <CardDescription>
                  Firmware {d.firmware_version ?? "—"}
                </CardDescription>
              </div>
              <span
                className={`chip ${
                  d.online
                    ? "bg-rose-50 text-rose-400"
                    : "bg-ash-200/60 text-plum-300"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    d.online ? "bg-rose-400 animate-pulse" : "bg-plum-200"
                  }`}
                />
                {d.online ? "Online" : "Offline"}
              </span>
            </div>
            <div className="text-xs text-plum-300">
              Last seen{" "}
              {d.last_seen_at
                ? formatRelativeTime(d.last_seen_at)
                : "— never"}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm">
                Rename
              </Button>
              <Button variant="ghost" size="sm">
                Unpair
              </Button>
            </div>
          </Card>
        ))}

        <Card className="flex flex-col items-start justify-between gap-4 border-dashed bg-transparent shadow-none">
          <div>
            <CardTitle>Add a new desk</CardTitle>
            <CardDescription>
              Power on your ESP32, connect it to Wi-Fi, and enter the 6-digit
              pairing code shown on its screen.
            </CardDescription>
          </div>
          <Button>Pair a device</Button>
        </Card>
      </div>
    </AppShell>
  );
}
