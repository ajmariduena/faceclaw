package com.faceclaw.app

/** Google Navigation SDK events for the Navigate worker, one JSON object per call. */
interface FaceclawGoogleNavListener {
    fun onEvent(json: String?): Unit
}
