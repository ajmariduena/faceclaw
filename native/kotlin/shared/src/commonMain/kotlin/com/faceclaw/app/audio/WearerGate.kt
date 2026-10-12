package com.faceclaw.app

import kotlin.math.log10
import kotlin.math.max
import kotlin.math.sqrt

/**
 * "My voice only" gate for live capture: the wearer's speech passes, everyone else's becomes
 * silence of the same length, so timing is kept and other voices never reach the recognizer.
 * Each turn's speech is held until it has been compared to the voice-print. [similarity]
 * returning null (model missing or failed) fails open.
 */
class WearerGate(
    private val selfThreshold: Double,
    private val similarity: (ShortArray, Int) -> Double?,
    private val log: (String) -> Unit = {},
) {
    companion object {
        const val SAMPLE_RATE = 16000
        /** Speech needed before a turn's first verdict; the embedder needs ~0.5 s. */
        const val DECIDE_SPEECH_MS = 800
        /** A turn still between thresholds after this much speech is decided at the midpoint. */
        const val FORCE_DECIDE_SPEECH_MS = 1600
        /** Speech window embedded for each verdict. */
        const val WINDOW_SPEECH_MS = 1200
        /** New speech between re-checks of a decided turn. */
        const val RECHECK_SPEECH_MS = 500
        const val TURN_GAP_MS = 700
        /** Similarities this far below [selfThreshold] count as someone else. */
        const val OTHER_MARGIN = 0.15
        const val MIN_NOISE_RMS = 220.0
        const val SPEECH_OVER_NOISE = 2.5
        // Noise floor follows quiet chunks quickly, louder noise slowly and speech barely,
        // so a long turn can't drag the floor up to its own level and end itself.
        const val NOISE_FALL = 0.3
        const val NOISE_RISE = 0.02
        const val NOISE_RISE_IN_SPEECH = 0.002
    }

    enum class State { PENDING, WEARER, OTHER }

    private var state = State.PENDING

    private val otherThreshold = selfThreshold - OTHER_MARGIN
    private val windowSamples = SAMPLE_RATE * WINDOW_SPEECH_MS / 1000
    private val speech = ShortArray(windowSamples)
    private var speechCount = 0
    private var turnSpeechSamples = 0
    private var speechSinceCheck = 0
    private var gapSamples = 0
    private var noiseRms = 0.0
    private val held = ArrayList<ShortArray>()

    /** Feeds one chunk; [emit] receives the chunks to forward, in order (possibly none, possibly several). */
    fun accept(pcm: ShortArray, count: Int, ssr: Int, emit: (ShortArray, Int) -> Unit) {
        if (count <= 0) return
        val chunk = pcm.copyOf(count)
        val rms = rms(chunk)
        val isSpeech = rms >= max(noiseRms, MIN_NOISE_RMS) * SPEECH_OVER_NOISE
        noiseRms = if (noiseRms == 0.0) (if (isSpeech) 0.0 else rms)
        else noiseRms + (rms - noiseRms) * when {
            rms < noiseRms -> NOISE_FALL
            isSpeech -> NOISE_RISE_IN_SPEECH
            else -> NOISE_RISE
        }

        if (isSpeech) {
            gapSamples = 0
            appendSpeech(chunk)
            turnSpeechSamples += count
            speechSinceCheck += count
        } else if (state != State.PENDING || held.isNotEmpty()) {
            gapSamples += count
        }

        when (state) {
            State.PENDING -> {
                if (held.isEmpty() && !isSpeech) {
                    emit(chunk, count)
                    return
                }
                held.add(chunk)
                if (gapSamples >= ms(TURN_GAP_MS)) {
                    // The turn ended before it was long enough to verify; too short
                    // to judge, so it passes rather than silencing a quick "yes".
                    log("wearer gate: short turn passed speechMs=${toMs(turnSpeechSamples)}")
                    release(emit, silence = false)
                    startTurn()
                    return
                }
                if (turnSpeechSamples >= ms(DECIDE_SPEECH_MS) && speechSinceCheck >= ms(RECHECK_SPEECH_MS)) {
                    decide(rms, ssr, emit)
                }
            }
            State.WEARER, State.OTHER -> {
                if (gapSamples >= ms(TURN_GAP_MS)) {
                    emitFor(state, chunk, emit)
                    startTurn()
                    return
                }
                if (speechSinceCheck >= ms(RECHECK_SPEECH_MS)) recheck(rms, ssr)
                emitFor(state, chunk, emit)
            }
        }
    }

    /** End of capture: resolves a turn still held back so its audio is not lost. */
    fun flush(emit: (ShortArray, Int) -> Unit) {
        if (state != State.PENDING || held.isEmpty()) return
        val sim = if (speechCount >= ms(500)) similarity(speech, speechCount) else null
        val wearer = sim == null || sim >= (selfThreshold + otherThreshold) / 2
        log("wearer gate: flush sim=${fmt(sim)} wearer=$wearer speechMs=${toMs(turnSpeechSamples)}")
        release(emit, silence = !wearer)
        startTurn()
    }

    private fun decide(rms: Double, ssr: Int, emit: (ShortArray, Int) -> Unit) {
        speechSinceCheck = 0
        val sim = similarity(speech, speechCount)
        val next = when {
            sim == null || sim >= selfThreshold -> State.WEARER
            sim < otherThreshold -> State.OTHER
            turnSpeechSamples >= ms(FORCE_DECIDE_SPEECH_MS) ->
                if (sim >= (selfThreshold + otherThreshold) / 2) State.WEARER else State.OTHER
            else -> State.PENDING
        }
        logVerdict("decide", sim, next, rms, ssr)
        if (next == State.PENDING) return
        state = next
        release(emit, silence = next == State.OTHER)
    }

    private fun recheck(rms: Double, ssr: Int) {
        speechSinceCheck = 0
        val sim = similarity(speech, speechCount) ?: return
        val next = when {
            sim >= selfThreshold -> State.WEARER
            sim < otherThreshold -> State.OTHER
            else -> state
        }
        if (next != state) logVerdict("switch", sim, next, rms, ssr)
        state = next
    }

    private fun startTurn() {
        state = State.PENDING
        speechCount = 0
        turnSpeechSamples = 0
        speechSinceCheck = 0
        gapSamples = 0
    }

    private fun release(emit: (ShortArray, Int) -> Unit, silence: Boolean) {
        for (chunk in held) {
            if (silence) emit(ShortArray(chunk.size), chunk.size) else emit(chunk, chunk.size)
        }
        held.clear()
    }

    private fun emitFor(state: State, chunk: ShortArray, emit: (ShortArray, Int) -> Unit) {
        if (state == State.OTHER) emit(ShortArray(chunk.size), chunk.size) else emit(chunk, chunk.size)
    }

    private fun appendSpeech(chunk: ShortArray) {
        val count = chunk.size
        if (count >= windowSamples) {
            chunk.copyInto(speech, 0, count - windowSamples, count)
            speechCount = windowSamples
            return
        }
        val overflow = speechCount + count - windowSamples
        if (overflow > 0) {
            speech.copyInto(speech, 0, overflow, speechCount)
            speechCount -= overflow
        }
        chunk.copyInto(speech, speechCount, 0, count)
        speechCount += count
    }

    private fun logVerdict(kind: String, sim: Double?, next: State, rms: Double, ssr: Int) {
        val dbfs = if (rms > 0) 20 * log10(rms / 32768.0) else -120.0
        log(
            "wearer gate: $kind sim=${fmt(sim)} state=$next speechMs=${toMs(turnSpeechSamples)}" +
                " dbfs=${fmt(dbfs)} noiseDbfs=${fmt(20 * log10(max(noiseRms, 1.0) / 32768.0))} ssr=$ssr",
        )
    }

    private fun rms(chunk: ShortArray): Double {
        var squares = 0.0
        for (s in chunk) squares += s.toDouble() * s
        return sqrt(squares / chunk.size)
    }

    private fun ms(value: Int) = SAMPLE_RATE / 1000 * value

    private fun toMs(samples: Int) = samples * 1000 / SAMPLE_RATE

    private fun fmt(value: Double?): String {
        if (value == null) return "n/a"
        val scaled = kotlin.math.round(value * 100).toLong()
        val sign = if (scaled < 0) "-" else ""
        val abs = kotlin.math.abs(scaled)
        return "$sign${abs / 100}.${(abs % 100).toString().padStart(2, '0')}"
    }
}
