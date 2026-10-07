import type { ProfileRow } from "@/db/schema";
import type { ProfileDraft } from "@/lib/types";

/** Converts a stored profile row into a draft (shared by server routes and exports). */
export function toDraft(profile: ProfileRow): ProfileDraft {
  return {
    name: profile.name,
    group: profile.group,
    protocol: profile.protocol,
    core: profile.core,
    transport: profile.transport,
    securityLayer: profile.securityLayer,
    serverAddress: profile.serverAddress,
    serverPort: profile.serverPort,
    uuid: profile.uuid,
    password: profile.password,
    publicKey: profile.publicKey,
    privateKey: profile.privateKey,
    presharedKey: profile.presharedKey,
    sni: profile.sni,
    host: profile.host,
    path: profile.path,
    serviceName: profile.serviceName,
    flow: profile.flow,
    fingerprint: profile.fingerprint,
    alterId: profile.alterId,
    encryption: profile.encryption,
    mtu: profile.mtu,
    dnsPrimary: profile.dnsPrimary,
    dnsSecondary: profile.dnsSecondary,
    allowedIps: profile.allowedIps,
    keepalive: profile.keepalive,
    blockingMode: profile.blockingMode,
    killSwitch: profile.killSwitch,
    notes: profile.notes,
    shareLink: profile.shareLink,
  };
}
