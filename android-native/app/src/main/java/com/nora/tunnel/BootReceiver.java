package com.nora.tunnel;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Starts the tunnel after boot only when the operator explicitly enabled it. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Prefs.bootStart(context)) {
            TunnelState.log("[boot] boot start disabled — nothing started");
            return;
        }
        if (Prefs.profileId(context) == 0) {
            TunnelState.log("[boot] no profile selected — nothing started");
            return;
        }
        TunnelState.log("[boot] starting tunnel for profile " + Prefs.profileName(context));
        NoraVpnService.start(context);
    }
}
