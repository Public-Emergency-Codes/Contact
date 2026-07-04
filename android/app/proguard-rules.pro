# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Add any project specific keep options here:

# Keep InCall native modules (called via reflection from React Native)
-keep class com.emessages.app.InCallModule { *; }
-keep class com.emessages.app.CallAudioModule { *; }
-keep class com.emessages.app.EmergencySwitchInCallService { *; }
-keep class com.emessages.app.InCallUiActivity { *; }
-keep class com.emessages.app.CallManager { *; }
