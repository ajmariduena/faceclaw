# Faceclaw - An unofficial user interface for the Even Realities G2 smart glasses

This is an unofficial user interface for the Even Realities G2 smart glasses.
It is entirely unofficial, and comes with no support or warranty from Even
Realities or from anyone.

This app runs on Android, and requires installing custom firmware on the
glasses. The Android app itself can install and uninstall the custom firmware;
it downloads the stock firmware from Even and applies patches generated from
https://github.com/jimrandomh/g2flash.

User-facing documentation lives at https://faceclaw.org/.


## Screenshots

![App launcher](website/screenshots/launcher.png)
![Music player](website/screenshots/music-player.png)
![Customization settings](website/screenshots/settings-customization.png)
![Compass](website/screenshots/compass.png)
![Blocks](website/screenshots/blocks.png)

## Installation

Download faceclaw-<version>.apk from the GitHub releases section on the phone
that will be paired with the glasses and install it. On first run, the app will
walk you through pairing with the glasses and installing custom firmware.


## Compiling

For the NativeScript iOS port, see [iOS development](notes/ios-development.md).
Use `scripts/pull_config_ios.sh` and `scripts/push_config_ios.sh` to transfer iPhone
settings; see [iOS config transfer](scripts/ios-config.md) for options and Android XML support.
The instructions below build the Android app.

If you want to customize faceclaw, the best way to do it is to download the
source code and using a coding agent such as Codex or Claude Code.

To compile, you will need an Android SDK environment with SDK version 35
installed and licenses accepted, and the ANDROID_HOME pointing to the install.
You will need Nativescript installed, and a JDK environment (v21), with the
JAVA_HOME environment variable pointed at it. You will also need a reasonably
up to date npm and nodejs installed. You can put environment variables in
build_paths.sh and they will be used by all build commands.

To install a version that you compiled, you will need developer mode enabled on
your phone, and `adb` connected. To enable developer mode, go to Settings>About
phone and tap the "Build number" field seven times. Then plug the phone's USB-C
port into your computer, authorize access on the phone, and run
`./build_and_run.sh` to install.

Note that if you have installed a signed release build, you will have to
uninstall it before installing a customized version. Use scripts/pull_config.sh
to export a copy of your configuration first, and scripts/push_config.sh to
import it into the new version.


## Features

<!-- Generated from website/content/features.md by scripts/sync-site.mjs; edit there. -->
<!-- BEGIN GENERATED: features -->
 * **Grok Bot on the glasses.** Say "Hey Even" to dictate to your Grok Bot
   (requires a Cursor API key); its replies show in full on the glasses, and a
   late reply buzzes and wakes them.
 * **Multitasking**, with an app-switcher sidebar and app launcher.
 * **Glanceboard**, a dashboard with widgets that you can quickly view with a
 * **Mostly-compatible with EvenHub.** Install and runapps from the Even app
   store.
 * **A lock screen**; glasses lock automatically when you take them off and
   unlock when you unlock your phone.
 * **The full display.** Full-screen apps can use the full 640x480 display
   area, rather than the 576x288 that EvenHub apps can use.
 * **Integration with Android notifications**: shows the same notification
   icons your phone does, and popups when notifications arrive.
 * **Terminal mirroring.** Mirror terminal apps such as Claude Code or Codex
   CLI with [g2mirror](https://github.com/jimrandomh/g2mirror), view them on
   the glasses, and send them inputs by voice.
 * **Media player controls** including playlist and media library navigation,
   compatible with most Android media players.
 * **Turn-by-turn directions** (requires a Mapbox API token).
 * **Nightscout**, an app for viewing blood-glucose data (requires a cloud
   server and API token).
 * **Power management**: the glasses go to sleep properly when the screen is
   off, and wake when you double-tap the ring or speak the wakeword, allowing
   battery life similar to the stock Even app.
 * **A Wear OS watch app** that replaces (and outdoes) the R1 ring: tap,
   swipe, hold and crown gestures, side buttons, app launching and window
   switching, voice or keyboard questions to Grok Bot with the reply on
   your wrist, typing into apps, and glasses status/lock/display control.
 * **On-phone screen mirroring**: Your phone screen shows the same contents as
   the glasses, and you can use the phone touchscreen as an input device..
<!-- END GENERATED: features -->

## Watch remote (Wear OS)

The `wear/` directory holds a companion app for Wear OS 3+ watches that turns
the watch into a remote for the glasses. The whole watch face is a touchpad
that mirrors the ring (tap, double-tap, hold, swipe, crown scrolling, side
buttons), and beyond the ring it can launch apps, switch and close windows,
wake/sleep/lock the display, send spoken or typed questions straight to
Grok Bot (using the watch's own microphone) and show the reply on the wrist,
and type text into apps such as the terminal. Its swipes are a spatial
control scheme the ring never had, with no mode to enter first: the
launcher highlights one app and moves it by rows and columns, right goes
into things (sidebar → window, settings section → items, next track in
Music), left backs out, tap selects, hold opens the context menu, double-tap
or a two-finger tap is back everywhere, and two wrist twists go back; up/down
scroll and right/left select/back everywhere else. The ring's own scheme is
unchanged — watch input is tagged as a separate source. Faceclaw's Settings > Watch
section has the phone-side switches. See [wear/README.md](wear/README.md) for
building and installing it; it is a separate Gradle build, sideloaded over
adb, and needs no Play Store. The phone side requires Google Play services.

## EvenHub App Notes

Faceclaw is mostly compatible with EvenHub apps. If you are developing an
app or using an open source app, you can package it into an EHPK file, send
it to your phone, and open it in the file browser to install. Or, you can log
into EvenHub and download apps there.

Faceclaw runs EvenHub apps through an emulation layer; you may run into bugs
and differences in behavior. If you run into bugs, please try tunning them in
the stock Android app before you report them to the app's creator. If you're
developing your own app and plan to submit it to the Hub, be sure to test it in
the stock Android app before submitting.

## Additional Caveats

Some permissions are used, but may not reliably prompted for. Go to Android
Settings > Apps > Faceclaw to ensure permissions are available or things may
not work.

Being a background app on a locked Android phone is fraught, and there may be
issues with manufacturer-psecific battery optimization software that lead to
it getting paused, throttled to low CPU usage, etc.

## Contributing

Be bold. Modify Faceclaw into the app that you want it to be for yourself,
without worrying about whether other people will like your version. Then if you
think your changes might be useful to others, make a pull request at 
https://github.com/jimrandomh/faceclaw. Consider joining the Discord server
to talk to other developer: https://discord.gg/XVFDFSwek3

The Typescript and Java code in this repository runs on your phone, not on the
glasses themselves, and (with the narrow exception of the firmware-updating
tool), can't hurt your hardware. For changes to the glasses firmware, refer to
[g2flash](https://github.com/jimrandomh/g2flash); changes there require more
caution.

Faceclaw is Free Software (GPLv3). Please only contribute code that you wrote
(or prompted an agent to write), hold the copyright to, and have tested on
physical hardware under real-world conditions. If you make any changes that
involve integration with a third party's API or services, modify PRIVACY to
mention them and link to that provider's privacy policy. For services that
involve a user-provided API key, we assume that the user agreed to any terms
associated with that service when they generated the key. For services that
don't involve API keys, more caution may be required.
