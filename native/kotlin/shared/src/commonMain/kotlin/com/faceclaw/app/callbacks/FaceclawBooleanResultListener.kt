package com.faceclaw.app

/** One boolean answer from a call that ran off the caller's thread, delivered on the main Looper. */
interface FaceclawBooleanResultListener {
    fun onResult(value: Boolean): Unit

    fun onError(message: String): Unit
}
