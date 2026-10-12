package com.faceclaw.app

import android.app.Activity
import android.app.Application
import android.content.Context
import android.location.Location
import android.os.Build
import android.os.Handler
import android.os.Looper

import com.google.android.libraries.mapsplatform.turnbyturn.model.Maneuver
import com.google.android.libraries.mapsplatform.turnbyturn.model.NavInfo
import com.google.android.libraries.mapsplatform.turnbyturn.model.NavState
import com.google.android.libraries.mapsplatform.turnbyturn.model.StepInfo
import com.google.android.libraries.navigation.NavigationApi
import com.google.android.libraries.navigation.Navigator
import com.google.android.libraries.navigation.RoadSnappedLocationProvider
import com.google.android.libraries.navigation.RoutingOptions
import com.google.android.libraries.navigation.Waypoint

import org.json.JSONArray
import org.json.JSONObject

/**
 * Google Navigation SDK without a map view: routing, guidance, rerouting and
 * road-snapped position, forwarded to the Navigate worker as JSON events.
 *
 * Navigator calls run on the main Looper; events are delivered on the Looper
 * of the thread that called start(), like FaceclawLocationTracker.
 */
object FaceclawGoogleNav {
    private val main = Handler(Looper.getMainLooper())
    private var apiKey: String? = null
    private var application: Application? = null
    private var navigator: Navigator? = null
    private var roadSnapped: RoadSnappedLocationProvider? = null
    private var listener: FaceclawGoogleNavListener? = null
    private var callbackHandler: Handler? = null
    private var maneuverNames: Map<Int, String>? = null

    private val locationListener = object : RoadSnappedLocationProvider.LocationListener {
        override fun onLocationChanged(location: Location) {
            emit(JSONObject()
                .put("type", "location")
                .put("lat", location.latitude)
                .put("lng", location.longitude)
                .put("bearing", if (location.hasBearing()) location.bearing.toDouble() else -1.0)
                .put("speed", if (location.hasSpeed()) location.speed.toDouble() else -1.0)
                .put("accuracy", if (location.hasAccuracy()) location.accuracy.toDouble() else -1.0)
                .put("bearingAccuracy", if (Build.VERSION.SDK_INT >= 26 && location.hasBearingAccuracy()) location.bearingAccuracyDegrees.toDouble() else -1.0))
        }

        override fun onRawLocationUpdate(location: Location) {}
    }

    /** NavigationApi.setApiKey may run once per process; a different key later needs a restart. */
    private fun useKey(key: String): String? {
        val current = apiKey
        if (current == key) return null
        if (current != null) return "restart"
        NavigationApi.setApiKey(key)
        apiKey = key
        return null
    }

    @JvmStatic
    fun termsAccepted(context: Context): Boolean =
        NavigationApi.areTermsAccepted(context.applicationContext as Application)

    /** Shows Google's navigation terms once; must be called on the main thread. */
    @JvmStatic
    fun ensureTerms(activity: Activity, key: String, result: FaceclawBooleanResultListener) {
        try {
            useKey(key)?.let { result.onError(it); return }
            if (NavigationApi.areTermsAccepted(activity.application)) {
                result.onResult(true)
                return
            }
            NavigationApi.showTermsAndConditionsDialog(activity, "Faceclaw") { accepted -> result.onResult(accepted) }
        } catch (error: Throwable) {
            result.onError(error.message ?: error.toString())
        }
    }

    @JvmStatic
    fun start(context: Context, key: String, listener: FaceclawGoogleNavListener) {
        val app = context.applicationContext as Application
        this.listener = listener
        callbackHandler = Handler(Looper.myLooper() ?: Looper.getMainLooper())
        main.post {
            try {
                useKey(key)?.let { emitError(it); return@post }
                application = app
                if (navigator != null) {
                    emit(JSONObject().put("type", "ready"))
                    return@post
                }
                if (!NavigationApi.areTermsAccepted(app)) {
                    emitError("terms")
                    return@post
                }
                NavigationApi.getNavigator(app, object : NavigationApi.NavigatorListener {
                    override fun onNavigatorReady(ready: Navigator) {
                        attach(app, ready)
                        emit(JSONObject().put("type", "ready"))
                    }

                    override fun onError(errorCode: Int) {
                        emitError(navigatorErrorName(errorCode))
                    }
                })
            } catch (error: Throwable) {
                emitError(error.message ?: error.toString())
            }
        }
    }

    /** Route to a Places id (preferred) or a coordinate, then start guidance. mode: driving, walking, two-wheeler, cycling. */
    @JvmStatic
    fun navigateTo(placeId: String, latitude: Double, longitude: Double, title: String, mode: String) {
        main.post {
            val nav = navigator
            if (nav == null) {
                emitError("not-ready")
                return@post
            }
            try {
                val builder = Waypoint.builder().setTitle(title)
                if (placeId.isNotEmpty()) builder.setPlaceIdString(placeId) else builder.setLatLng(latitude, longitude)
                val options = RoutingOptions().travelMode(travelMode(mode))
                nav.setDestination(builder.build(), options).setOnResultListener { status ->
                    if (status == Navigator.RouteStatus.OK) {
                        nav.startGuidance()
                        emitRoute(nav)
                    }
                    emit(JSONObject().put("type", "status").put("status", status.name))
                }
            } catch (error: Throwable) {
                emitError(error.message ?: error.toString())
            }
        }
    }

    @JvmStatic
    fun stop() {
        main.post {
            val nav = navigator ?: return@post
            try {
                nav.stopGuidance()
                nav.clearDestinations()
            } catch (error: Throwable) {
                emitError(error.message ?: error.toString())
            }
        }
    }

    /** Drops the worker's listener; the Navigator stays alive for the next trip. */
    @JvmStatic
    fun detach() {
        main.post {
            listener = null
            callbackHandler = null
        }
    }

    internal fun onNavInfo(info: NavInfo) {
        val json = JSONObject()
            .put("type", "nav")
            .put("state", navStateName(info.navState))
            .put("stepMeters", info.distanceToCurrentStepMeters ?: -1)
            .put("stepSeconds", info.timeToCurrentStepSeconds ?: -1)
            .put("destMeters", info.distanceToFinalDestinationMeters ?: -1)
            .put("destSeconds", info.timeToFinalDestinationSeconds ?: -1)
        info.currentStep?.let { json.put("step", stepJson(it)) }
        info.remainingSteps?.firstOrNull()?.let { json.put("next", stepJson(it)) }
        emit(json)
        if (info.routeChanged) navigator?.let { emitRoute(it) }
    }

    private fun attach(app: Application, nav: Navigator) {
        navigator = nav
        nav.setAudioGuidance(Navigator.AudioGuidance.SILENT)
        nav.setHeadsUpNotificationEnabled(false)
        nav.addArrivalListener { event ->
            emit(JSONObject().put("type", "arrived").put("final", event.isFinalDestination))
        }
        nav.addReroutingListener { emit(JSONObject().put("type", "rerouting")) }
        nav.addRouteChangedListener { emitRoute(nav) }
        nav.registerServiceForNavUpdates(app.packageName, FaceclawNavInfoService::class.java.name, 1)
        roadSnapped = NavigationApi.getRoadSnappedLocationProvider(app)
        roadSnapped?.addLocationListener(locationListener)
    }

    private fun emitRoute(nav: Navigator) {
        val points = JSONArray()
        for (segment in nav.routeSegments ?: emptyList()) {
            for (latLng in segment.latLngs ?: emptyList()) {
                points.put(JSONArray().put(latLng.latitude).put(latLng.longitude))
            }
        }
        emit(JSONObject().put("type", "route").put("points", points))
    }

    private fun stepJson(step: StepInfo): JSONObject = JSONObject()
        .put("maneuver", maneuverName(step.maneuver))
        .put("road", step.fullRoadName ?: "")
        .put("simpleRoad", step.simpleRoadName ?: "")
        .put("instruction", step.fullInstructionText ?: "")
        .put("roundabout", step.roundaboutTurnNumber ?: -1)
        .put("exit", step.exitNumber ?: "")

    private fun maneuverName(value: Int): String {
        val names = maneuverNames ?: Maneuver::class.java.fields
            .filter { java.lang.reflect.Modifier.isStatic(it.modifiers) && it.type == Int::class.javaPrimitiveType }
            .associate { it.getInt(null) to it.name }
            .also { maneuverNames = it }
        return names[value] ?: "UNKNOWN"
    }

    private fun navStateName(value: Int): String = when (value) {
        NavState.ENROUTE -> "ENROUTE"
        NavState.REROUTING -> "REROUTING"
        NavState.STOPPED -> "STOPPED"
        else -> "UNKNOWN"
    }

    private fun travelMode(mode: String): Int = when (mode) {
        "walking" -> RoutingOptions.TravelMode.WALKING
        "two-wheeler" -> RoutingOptions.TravelMode.TWO_WHEELER
        "cycling" -> RoutingOptions.TravelMode.CYCLING
        else -> RoutingOptions.TravelMode.DRIVING
    }

    private fun navigatorErrorName(code: Int): String = when (code) {
        NavigationApi.ErrorCode.NOT_AUTHORIZED -> "not-authorized"
        NavigationApi.ErrorCode.TERMS_NOT_ACCEPTED -> "terms"
        NavigationApi.ErrorCode.NETWORK_ERROR -> "network"
        NavigationApi.ErrorCode.LOCATION_PERMISSION_MISSING -> "location-permission"
        else -> "navigator-$code"
    }

    private fun emitError(code: String) {
        emit(JSONObject().put("type", "error").put("code", code))
    }

    private fun emit(json: JSONObject) {
        val target = listener ?: return
        val handler = callbackHandler ?: return
        val text = json.toString()
        handler.post {
            if (listener === target) target.onEvent(text)
        }
    }
}
