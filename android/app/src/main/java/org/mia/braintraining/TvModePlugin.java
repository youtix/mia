package org.mia.braintraining;

import android.app.UiModeManager;
import android.content.Context;
import android.content.res.Configuration;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Détection native d'Android TV (FEAT-15 §3.5) : la détection CSS du mode TV échoue avec une
 * télécommande à pointeur (« air mouse »), UiModeManager fait foi. Côté web : src/core/storage/tv-mode.ts.
 */
@CapacitorPlugin(name = "TvMode")
public class TvModePlugin extends Plugin {

    @PluginMethod
    public void isTelevision(PluginCall call) {
        UiModeManager uiModeManager = (UiModeManager) getContext().getSystemService(Context.UI_MODE_SERVICE);
        boolean television =
            uiModeManager != null && uiModeManager.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION;
        JSObject result = new JSObject();
        result.put("value", television);
        call.resolve(result);
    }
}
