!macro customInstall
  DetailPrint "Installing private AI runtime and checking Docker Desktop (internet required)..."
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\setup\install-dependencies.ps1"'
  Pop $0
  ${If} $0 != 0
    DetailPrint "Dependency installation needs attention. Open Wayfinder to retry in onboarding."
  ${EndIf}
!macroend
