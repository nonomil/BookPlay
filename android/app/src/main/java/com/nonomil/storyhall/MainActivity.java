package com.nonomil.storyhall;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(DataPackPlugin.class);
        LocalRangeServer.ensure(this);
        super.onCreate(savedInstanceState);
    }
}
