package com.faceclaw.app

import android.app.Service
import android.content.Intent
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.Message
import android.os.Messenger

import com.google.android.libraries.mapsplatform.turnbyturn.TurnByTurnManager

/** Receives the Navigation SDK's turn-by-turn feed (about once a second) and hands it to FaceclawGoogleNav. */
class FaceclawNavInfoService : Service() {
    private val turnByTurn: TurnByTurnManager = TurnByTurnManager.createInstance()

    private val messenger = Messenger(object : Handler(Looper.getMainLooper()) {
        override fun handleMessage(msg: Message) {
            if (msg.what != TurnByTurnManager.MSG_NAV_INFO) return
            val info = turnByTurn.readNavInfoFromBundle(msg.data) ?: return
            FaceclawGoogleNav.onNavInfo(info)
        }
    })

    override fun onBind(intent: Intent?): IBinder = messenger.binder
}
