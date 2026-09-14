@echo off
rem Construit l'APK Android de test (release signee avec la cle de debogage).
setlocal
for %%I in ("%~dp0..") do set "PROJET=%%~fI"
set "JAVA_HOME=%USERPROFILE%\.gradle\jdks\eclipse_adoptium-21-amd64-windows.2"
set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
set "PATH=%JAVA_HOME%\bin;%PATH%"
echo Projet : %PROJET%
pushd "%PROJET%\android" || exit /b 1
call .\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon --console=plain
set CODE=%ERRORLEVEL%
popd
if %CODE%==0 copy /Y "%PROJET%\android\app\build\outputs\apk\release\app-release.apk" "%PROJET%\Detente-Loisirs-natif.apk" >nul
exit /b %CODE%
