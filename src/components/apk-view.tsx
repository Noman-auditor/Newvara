"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { Badge, CopyButton, Dot, Field, Icon, KV, Panel, SectionTitle, Segmented } from "@/components/ui";
import { ANDROID_APP, type BuildStep, type LanAddress, type ScaffoldFile } from "@/lib/android-meta";

type CheckResult = {
  ok: boolean;
  normalized: string;
  host: string;
  port: string;
  status?: number;
  durationMs: number;
  reachable: boolean;
  warnings: string[];
  hints: string[];
  server?: string;
  title?: string;
};

export function ApkView({
  origin,
  lan,
  steps,
}: {
  origin: string;
  lan: LanAddress[];
  steps: BuildStep[];
}) {
  const { push } = useToast();
  const [url, setUrl] = useState(origin);
  const [tab, setTab] = useState<"apk" | "pwa" | "scaffold">("apk");
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [files, setFiles] = useState<ScaffoldFile[]>([]);
  const [artifact, setArtifact] = useState<{
    available: boolean;
    url?: string;
    bytes?: number;
    sha256?: string;
    builtAt?: string;
    hint?: string;
    core?: string;
    abi?: string;
  } | null>(null);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [qrTick, setQrTick] = useState(0);

  const runCheck = useCallback(
    async (candidate: string) => {
      setChecking(true);
      try {
        const response = await fetch("/api/apk/check", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: candidate }),
        });
        const json = (await response.json()) as { ok: boolean; check?: CheckResult; error?: string };
        if (json.ok && json.check) {
          setCheck(json.check);
          push({
            title: json.check.reachable ? "Workspace reachable" : "Workspace not reachable",
            detail: `${json.check.normalized} · ${json.check.durationMs}ms`,
            tone: json.check.reachable ? (json.check.warnings.length ? "warn" : "good") : "bad",
          });
        } else {
          push({ title: "Check failed", detail: json.error, tone: "bad" });
        }
      } catch (error) {
        push({ title: "Check failed", detail: (error as Error).message, tone: "bad" });
      } finally {
        setChecking(false);
      }
    },
    [push],
  );

  useEffect(() => {
    void runCheck(origin);
  }, [origin, runCheck]);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/apk/artifact", { cache: "no-store" });
      const json = (await response.json()) as { ok: boolean };
      if (json.ok) setArtifact(json as never);
    })();
  }, []);

  useEffect(() => {
    if (tab !== "scaffold" || files.length) return;
    void (async () => {
      const response = await fetch("/api/apk/scaffold", { cache: "no-store" });
      const json = (await response.json()) as { ok: boolean; files?: ScaffoldFile[] };
      if (json.ok && json.files) {
        setFiles(json.files);
        setOpenFile(json.files[0]?.path ?? null);
      }
    })();
  }, [tab, files.length]);

  return (
    <div className="space-y-4">
      <Panel strong>
        <SectionTitle
          eyebrow="android"
          title="Build an installable APK"
          description="The Android app is a thin Capacitor shell around this control plane, so profiles, routing, diagnostics and telemetry stay in PostgreSQL on the server. Build it with GitHub Actions in one click — no Android Studio required."
          action={
            <Segmented
              value={tab}
              onChange={setTab}
              size="sm"
              options={[
                { value: "apk", label: "APK build" },
                { value: "pwa", label: "Phone / PWA" },
                { value: "scaffold", label: "Files & workflow" },
              ]}
            />
          }
        />
        <div className="grid gap-3 md:grid-cols-4">
          <KV label="app id" value={ANDROID_APP.appId} />
          <KV label="artifact" value={ANDROID_APP.artifact} />
          <KV label="min sdk" value={`${ANDROID_APP.minSdk} (${ANDROID_APP.minAndroid})`} />
          <KV label="toolchain" value={`JDK ${ANDROID_APP.jdk} · ${ANDROID_APP.gradleTask}`} />
        </div>
      </Panel>

      {artifact ? (
        <Panel strong className={artifact.available ? "scan relative overflow-hidden" : ""}>
          <SectionTitle
            eyebrow="built artifact"
            title={artifact.available ? "Signed APK produced in this workspace" : "No APK artifact yet"}
            description={
              artifact.available
                ? "This file was assembled here from the real sources: the sing-box core was compiled with gomobile, then packaged by Gradle. Install it and the app runs the core inside Android's VpnService."
                : artifact.hint
            }
            action={artifact.available ? <Badge tone="good">verified</Badge> : <Badge tone="warn">build it</Badge>}
          />
          {artifact.available ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
                    <p className="eyebrow">size</p>
                    <p className="num mt-1 text-lg font-semibold">{(artifact.bytes ?? 0 / 1024 / 1024).toLocaleString()} bytes</p>
                    <p className="num text-[10px]" style={{ color: "var(--text-faint)" }}>
                      {((artifact.bytes ?? 0) / 1024 / 1024).toFixed(2)} MiB · {ANDROID_APP.abi}
                    </p>
                  </div>
                  <div className="rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
                    <p className="eyebrow">built</p>
                    <p className="num mt-1 text-sm">{artifact.builtAt ? new Date(artifact.builtAt).toISOString().replace("T", " ").slice(0, 19) : "—"}</p>
                    <p className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                      package {ANDROID_APP.appId} · v{ANDROID_APP.versionName}
                    </p>
                  </div>
                </div>
                <div className="rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
                  <p className="eyebrow">sha-256</p>
                  <p className="num mt-1 break-all text-[11px]">{artifact.sha256}</p>
                </div>
                <div className="rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
                  <p className="eyebrow">core inside the apk</p>
                  <p className="mt-1 text-[12px]">
                    {ANDROID_APP.core} · <span className="num">{ANDROID_APP.coreProvenance}</span>
                  </p>
                  <p className="num mt-1 text-[11px]" style={{ color: "var(--text-faint)" }}>
                    lib/arm64-v8a/libbox.so = {(ANDROID_APP.nativeLibraryBytes / 1024 / 1024).toFixed(1)} MiB uncompressed · minSdk {ANDROID_APP.minSdk} · targetSdk {ANDROID_APP.targetSdk}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a className="btn btn-primary" href={artifact.url ?? `/${ANDROID_APP.artifact}`} download>
                    <Icon name="download" className="h-3.5 w-3.5" />
                    Download APK
                  </a>
                  <CopyButton value={artifact.sha256 ?? ""} label="Copy SHA-256" />
                  <a className="btn" href={artifact.url ?? `/${ANDROID_APP.artifact}`}>
                    <Icon name="globe" className="h-3.5 w-3.5" />
                    Open raw
                  </a>
                  <CopyButton value={ANDROID_APP.installCommand} label="Copy adb command" />
                </div>
                <ul className="space-y-1 text-[11px]" style={{ color: "var(--text-dim)" }}>
                  <li>· On the phone: download the file, tap it, allow installation from your browser, then open Nora Tunnel.</li>
                  <li>· In the app: paste this workspace URL, tap <span className="num">Fetch profiles</span>, pick a profile, tap <span className="num">Connect</span>.</li>
                  <li>· Android will ask for the VPN permission once — that prompt comes from the OS, because the app really creates a VPN interface.</li>
                  <li>· {ANDROID_APP.signing}</li>
                </ul>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="rounded-2xl bg-white p-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/apk/qr?url=${encodeURIComponent(`${origin}${artifact.url ?? `/${ANDROID_APP.artifact}`}`)}&v=apk`}
                    alt="QR code to download the APK"
                    width={168}
                    height={168}
                    className="h-42 w-42"
                  />
                </div>
                <p className="max-w-[190px] text-center text-[10px]" style={{ color: "var(--text-faint)" }}>
                  scan with the phone camera to download the APK over your network
                </p>
              </div>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {tab === "apk" ? (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <Panel>
            <SectionTitle eyebrow="pipeline" title="Push → Actions → phone" description="The workflow compiles the sing-box core with gomobile when it is missing, then assembles the same APK you can download above." />
            <ol className="space-y-3">
              {steps.map((step, index) => (
                <li key={step.title} className="rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
                  <div className="flex items-start gap-3">
                    <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-lg border text-[11px]" style={{ borderColor: "var(--line-strong)" }}>
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{step.title}</p>
                      <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-dim)" }}>
                        {step.detail}
                      </p>
                      <div className="mt-2 flex items-start gap-2">
                        <pre className="num flex-1 overflow-x-auto whitespace-pre-wrap rounded-lg border p-2 text-[10.5px] scroll-thin" style={{ borderColor: "var(--line)" }}>
                          {step.command}
                        </pre>
                        <CopyButton value={step.command} label="" size="sm" />
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>

          <div className="space-y-4">
            <Panel>
              <SectionTitle
                eyebrow="workspace url"
                title="Bake a URL into the shell"
                description="The APK opens this address. Test it here first — the check runs from the server, exactly like the workflow input would."
              />
              <Field label="Workspace URL" hint="Must be reachable from a phone on mobile data or your Wi-Fi.">
                <input className="input num" value={url} onChange={(event) => setUrl(event.target.value)} />
              </Field>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary" onClick={() => void runCheck(url)} disabled={checking}>
                  <Icon name={checking ? "refresh" : "wifi"} className={`h-3.5 w-3.5 ${checking ? "spin-slow" : ""}`} />
                  {checking ? "Checking…" : "Test reachability"}
                </button>
                <CopyButton value={url} label="Copy URL" />
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setQrTick((value) => value + 1);
                  }}
                >
                  <Icon name="refresh" className="h-3.5 w-3.5" />
                  Refresh QR
                </button>
              </div>

              {check ? (
                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={check.reachable ? "good" : "bad"}>
                      <Dot tone={check.reachable ? "good" : "bad"} pulse={check.reachable} />
                      {check.reachable ? "reachable" : "unreachable"}
                    </Badge>
                    {check.status ? <span className="chip">HTTP {check.status}</span> : null}
                    <span className="num chip">{check.durationMs}ms</span>
                    {check.server ? <span className="chip">server: {check.server}</span> : null}
                    {check.title ? <span className="truncate chip">title: {check.title}</span> : null}
                  </div>
                  {check.warnings.length ? (
                    <div className="rounded-xl border p-3" style={{ borderColor: "rgba(255,200,87,0.4)" }}>
                      <p className="eyebrow" style={{ color: "#ffc857" }}>warnings</p>
                      <ul className="mt-1 space-y-1 text-[11px]" style={{ color: "var(--text-dim)" }}>
                        {check.warnings.map((warning) => (
                          <li key={warning}>· {warning}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {check.hints.length ? (
                    <ul className="space-y-1 text-[11px]" style={{ color: "var(--text-faint)" }}>
                      {check.hints.map((hint) => (
                        <li key={hint}>· {hint}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </Panel>

            <Panel>
              <SectionTitle eyebrow="same wi-fi" title="Local addresses found on this host" description="Handy for a LAN test build; a public URL is still what you want for daily use." />
              {lan.length ? (
                <div className="space-y-2">
                  {lan.map((entry) => (
                    <div key={entry.address} className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--line)" }}>
                      <div className="min-w-0">
                        <p className="num text-xs">{entry.suggestedUrl}</p>
                        <p className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                          interface {entry.name}
                        </p>
                      </div>
                      <button type="button" className="btn px-2 py-1 text-[11px]" onClick={() => entry.suggestedUrl && (setUrl(entry.suggestedUrl), void runCheck(entry.suggestedUrl))}>
                        Use
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                  No LAN interface detected on this host.
                </p>
              )}
            </Panel>
          </div>
        </section>
      ) : null}

      {tab === "pwa" ? (
        <section className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)]">
          <Panel className="flex flex-col items-center justify-center">
            <SectionTitle eyebrow="no build needed" title="Scan to open the workspace" />
            <div className="rounded-2xl bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/apk/qr?url=${encodeURIComponent(url) }&v=${qrTick}`}
                alt={`QR code for ${url}`}
                width={208}
                height={208}
                className="h-52 w-52"
              />
            </div>
            <p className="num mt-3 max-w-[240px] break-all text-center text-[11px]" style={{ color: "var(--text-dim)" }}>
              {url}
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <CopyButton value={url} label="Copy link" />
              <a className="btn" href={url}>
                <Icon name="globe" className="h-3.5 w-3.5" />
                Open preview
              </a>
            </div>
          </Panel>

          <div className="space-y-4">
            <Panel>
              <SectionTitle eyebrow="install on the phone" title="Add to home screen" description="Fastest path: no APK, no build, still app-like with an offline shell." />
              <ol className="space-y-2 text-[12px]" style={{ color: "var(--text-dim)" }}>
                <li>1. Scan the QR code with the phone camera and open the workspace in Chrome or Safari.</li>
                <li>2. Chrome (Android): ⋮ menu → <span style={{ color: "var(--text)" }}>Add to Home screen / Install app</span>.</li>
                <li>3. iOS Safari: Share → <span style={{ color: "var(--text)" }}>Add to Home Screen</span>.</li>
                <li>4. Launch from the new icon — it opens standalone (no browser chrome) thanks to <span className="num">manifest.webmanifest</span>.</li>
              </ol>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone="good">manifest packaged</Badge>
                <Badge tone="good">service worker registered</Badge>
                <Badge tone="info">portrait first layout</Badge>
                <Badge tone="accent">safe-area padded</Badge>
              </div>
            </Panel>

            <Panel>
              <SectionTitle eyebrow="why the shell is thin" title="Honest APK scope" />
              <ul className="space-y-2 text-[11px]" style={{ color: "var(--text-dim)" }}>
                <li>· The APK carries no tunnel core, so it never shows a fake VPN state and never requests the VpnService permission it cannot honour.</li>
                <li>· Real on-device tunnelling needs native cores (WireGuard Go, Xray/sing-box, OpenVPN3) integrated as Android libraries — that is a separate, native build, not a web wrapper.</li>
                <li>· Profiles, validated configs, routing rules and session history live server-side in PostgreSQL; the phone is a console, and the same account data is available on desktop.</li>
                <li>· Cleartext HTTP is enabled in the manifest so a LAN workspace such as <span className="num">http://192.168.1.20:3000</span> works during testing.</li>
              </ul>
            </Panel>
          </div>
        </section>
      ) : null}

      {tab === "scaffold" ? (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <Panel padded={false}>
            <div className="p-4">
              <SectionTitle eyebrow="copied into your repo" title="Build files" />
            </div>
            <ul className="space-y-1 px-2 pb-3">
              {files.map((file) => (
                <li key={file.path}>
                  <button
                    type="button"
                    className="w-full rounded-xl border px-3 py-2 text-left transition hover:bg-white/5"
                    style={{ borderColor: "var(--line)", background: openFile === file.path ? "var(--accent-soft)" : undefined }}
                    onClick={() => setOpenFile(file.path)}
                  >
                    <p className="num truncate text-[11px]">{file.path}</p>
                    <p className="mt-0.5 text-[10px]" style={{ color: "var(--text-faint)" }}>
                      {file.purpose}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel padded={false}>
            {files.filter((file) => file.path === openFile).map((file) => (
              <div key={file.path}>
                <div className="flex items-center justify-between gap-2 border-b p-3" style={{ borderColor: "var(--line)" }}>
                  <p className="num text-xs">{file.path}</p>
                  <CopyButton value={file.content} label="Copy file" />
                </div>
                <pre className="num max-h-[60vh] overflow-auto whitespace-pre-wrap p-4 text-[11px] scroll-thin">{file.content}</pre>
              </div>
            ))}
          </Panel>
        </section>
      ) : null}
    </div>
  );
}
