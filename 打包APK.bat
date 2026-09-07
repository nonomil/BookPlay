@echo off
chcp 65001 >nul
cd /d "%~dp0"
call npm run android:build
echo.
echo Mobile APK: release\storyhall-mobile-debug.apk
echo TV APK: release\storyhall-tv-debug.apk
echo Handheld APK (X35S 掌机): release\storyhall-handheld-debug.apk
pause
