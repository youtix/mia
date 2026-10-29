package org.mia.braintraining;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin local (détection Android TV) : enregistré avant que le pont ne soit construit.
        registerPlugin(TvModePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
