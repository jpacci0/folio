@echo off
cd /d "%~dp0"
if exist "release\final\Folio-0.1.0-Windows.exe" (
  start "" "release\final\Folio-0.1.0-Windows.exe"
  exit /b 0
)
if exist "release\Folio-0.1.0-Windows.exe" (
  start "" "release\Folio-0.1.0-Windows.exe"
  exit /b 0
)
if exist "release\Folio-Windows\Folio.exe" (
  start "" "release\Folio-Windows\Folio.exe"
  exit /b 0
)
echo Apri README.md per installare le dipendenze e avviare Folio.
pause
