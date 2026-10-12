package com.faceclaw.app

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class WearerGateTest {
    private val chunk = 800

    /** Chunk amplitude doubles as the speaker id: the fake embedder scores 1000 as the wearer. */
    private class Run(wearerAmplitude: Int = 1000) {
        val out = mutableListOf<Int>()
        var checks = 0
        val gate = WearerGate(0.55, { pcm, count ->
            checks++
            val last = kotlin.math.abs(pcm[count - 1].toInt())
            if (last == wearerAmplitude) 0.9 else 0.1
        })

        fun feed(vararg amplitudes: Int) {
            for (amplitude in amplitudes) {
                gate.accept(ShortArray(800) { amplitude.toShort() }, 800, 0) { pcm, _ -> out.add(pcm[0].toInt()) }
            }
        }

        fun flush() = gate.flush { pcm, _ -> out.add(pcm[0].toInt()) }
    }

    private fun chunks(amplitude: Int, count: Int) = IntArray(count) { amplitude }

    @Test
    fun silenceBeforeSpeechPassesWithoutDelay() {
        val run = Run()
        run.feed(*chunks(0, 5))
        assertEquals(List(5) { 0 }, run.out)
        assertEquals(0, run.checks)
    }

    @Test
    fun wearerTurnIsHeldUntilVerifiedThenReleasedInOrder() {
        val run = Run()
        run.feed(*chunks(1000, 15))
        assertTrue(run.out.isEmpty())
        run.feed(1000)
        assertEquals(List(16) { 1000 }, run.out)
        run.feed(1000)
        assertEquals(17, run.out.size)
    }

    @Test
    fun otherSpeakerBecomesSilenceOfTheSameLength() {
        val run = Run()
        run.feed(*chunks(2000, 30))
        assertEquals(List(30) { 0 }, run.out)
    }

    @Test
    fun speakerTakingOverMidTurnIsSilencedAfterTheRecheck() {
        val run = Run()
        run.feed(*chunks(1000, 16))
        run.feed(*chunks(2000, 10))
        val tail = run.out.drop(16)
        assertEquals(10, tail.size)
        assertEquals(0, tail.last())
        assertTrue(tail.take(9).all { it == 2000 })
    }

    @Test
    fun pauseStartsANewTurnThatIsVerifiedAgain() {
        val run = Run()
        run.feed(*chunks(1000, 16))
        run.feed(*chunks(0, 14))
        run.feed(*chunks(2000, 20))
        assertEquals(50, run.out.size)
        assertTrue(run.out.takeLast(20).all { it == 0 })
    }

    @Test
    fun shortTurnPassesAndPendingTurnResolvesOnFlush() {
        val short = Run()
        short.feed(*chunks(2000, 4))
        short.feed(*chunks(0, 14))
        assertEquals(List(4) { 2000 } + List(14) { 0 }, short.out)

        val ending = Run()
        ending.feed(*chunks(2000, 12))
        assertTrue(ending.out.isEmpty())
        ending.flush()
        assertEquals(List(12) { 0 }, ending.out)
    }

    @Test
    fun missingSimilarityFailsOpen() {
        val out = mutableListOf<Int>()
        val gate = WearerGate(0.55, { _, _ -> null })
        repeat(20) { gate.accept(ShortArray(chunk) { 2000 }, chunk, 0) { pcm, _ -> out.add(pcm[0].toInt()) } }
        assertEquals(List(20) { 2000 }, out)
    }
}
