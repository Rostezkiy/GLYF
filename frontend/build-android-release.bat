@echo off
setlocal

echo === Frontend build ===
call npm run build
if errorlevel 1 exit /b 1

echo === Capacitor sync ===
call npx cap sync android
if errorlevel 1 exit /b 1

echo === Android release build ===
cd android
call gradlew assembleRelease
if errorlevel 1 exit /b 1

echo === APK ready ===
echo android\app\build\outputs\apk\release\app-release.apk

endlocal
pause
