"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { PanelHeader } from "@/components/ui/PanelHeader";

type SerialPortLike = {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open: (opts: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
};

declare global {
  interface Navigator {
    serial?: {
      requestPort: (opts: { filters: { usbVendorId: number }[] }) => Promise<SerialPortLike>;
    };
  }
}

/**
 * Chrome / Edge only: sends Wi-Fi credentials to the ESP32 over USB serial.
 * Firmware must include trySerialWifiProvision() and a line like:
 *   {"ssid":"MyNet","pass":"secret"}\n
 */
export function WifiSerialProvision() {
  const [log, setLog] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const portRef = useRef<SerialPortLike | null>(null);

  const pickPort = useCallback(async () => {
    if (!navigator.serial) {
      setLog("Web Serial is not available. Use Chrome or Edge on desktop, or paste the JSON into Arduino Serial Monitor instead.");
      return;
    }
    try {
      const port = await navigator.serial.requestPort({ filters: [] });
      portRef.current = port;
      setLog("Port selected. Fill in SSID and password, then click Send.");
    } catch {
      setLog("No port selected.");
    }
  }, []);

  const sendCredentials = useCallback(
    async (formData: FormData) => {
      const ssid = String(formData.get("ssid") ?? "").trim();
      const pass = String(formData.get("pass") ?? "");
      if (!ssid) {
        setLog("Enter a network name (SSID).");
        return;
      }
      if (!navigator.serial) {
        setLog("Web Serial unavailable in this browser.");
        return;
      }
      const port = portRef.current;
      if (!port) {
        setLog('Click "Choose USB port" first.');
        return;
      }

      setBusy(true);
      setLog(null);
      try {
        await port.open({ baudRate: 115200 });
        const enc = new TextEncoder();
        const line =
          `{"ssid":${JSON.stringify(ssid)},"pass":${JSON.stringify(pass)}}\n`;
        const writer = port.writable!.getWriter();
        await writer.write(enc.encode(line));
        writer.releaseLock();

        const reader = port.readable!.getReader();
        const dec = new TextDecoder();
        let out = "";
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) out += dec.decode(value);
          if (out.includes("reboot") || out.includes("OK")) break;
        }
        reader.releaseLock();
        await port.close();
        portRef.current = null;
        setLog(
          out.trim().length
            ? `Device replied: ${out.trim().slice(0, 200)}`
            : "Sent. The desk should restart and join Wi-Fi within a few seconds."
        );
      } catch (e) {
        setLog((e as Error).message ?? "Send failed.");
      } finally {
        setBusy(false);
      }
    },
    []
  );

  return (
    <div className="card overflow-hidden shadow-card">
      <PanelHeader
        title="Wi-Fi over USB (Chrome)"
        subtitle="No more hard-coded SSID in the sketch — push credentials once, then the desk stores them on the chip."
      />
      <div className="space-y-4 p-4 sm:p-5">
        <p className="text-sm text-plum-300">
          Plug the CYD into this computer with a data USB cable. Choose the port, enter your home Wi-Fi
          name and password, then send. The firmware saves them in NVS and reboots — you do not need to
          re-flash for a new network.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => void pickPort()}>
            Choose USB port
          </Button>
        </div>

        <form action={sendCredentials} className="space-y-3">
          <div>
            <label htmlFor="wifi-ssid" className="text-xs font-medium text-plum-400">
              Wi-Fi name (SSID)
            </label>
            <input
              id="wifi-ssid"
              name="ssid"
              className="input mt-1 w-full"
              autoComplete="off"
              placeholder="Your network"
            />
          </div>
          <div>
            <label htmlFor="wifi-pass" className="text-xs font-medium text-plum-400">
              Password
            </label>
            <input
              id="wifi-pass"
              name="pass"
              type="password"
              className="input mt-1 w-full"
              autoComplete="off"
              placeholder="Wi-Fi password"
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send to desk & reboot"}
          </Button>
        </form>

        {log ? (
          <Notice tone={log.startsWith("Sent") || log.includes("replied") ? "success" : "danger"}>
            {log}
          </Notice>
        ) : null}

        <p className="text-xs text-plum-200">
          Fallback: open Arduino IDE → Serial Monitor @ 115200 baud and paste one line:{" "}
          <code className="rounded bg-blush-50/90 px-1 font-mono text-[11px]">
            {`{"ssid":"YOUR_NET","pass":"YOUR_PASS"}`}
          </code>{" "}
          then press Enter.
        </p>
      </div>
    </div>
  );
}
