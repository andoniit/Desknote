import { AppShell } from "@/components/AppShell";
import { WifiSerialProvision } from "@/components/devices/WifiSerialProvision";
import { PageHeader } from "@/components/ui/PageHeader";
import { AppLink } from "@/components/ui/AppLink";

export const metadata = { title: "Desk Wi-Fi (USB)" };

export default function ConnectWifiPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Devices"
        title="Put your desk on Wi-Fi"
        description="The ESP32 cannot read your home network name from desknote.space until it is online. Use USB once to store credentials in flash, or keep compile-time defaults for development."
      />

      <WifiSerialProvision />

      <p className="mt-8 text-sm text-plum-300">
        <AppLink href="/devices" variant="inline">
          Back to devices
        </AppLink>
      </p>
    </AppShell>
  );
}
