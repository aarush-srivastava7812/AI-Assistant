param([switch]$SkipDocker, [string]$RuntimeRoot)
$ErrorActionPreference='Stop'
# Called by the setup installer and the app's explicit retry button. No credentials.
if (!$RuntimeRoot) { $RuntimeRoot=Join-Path $env:LOCALAPPDATA 'WayfinderRuntime' }
$RuntimeRoot=[IO.Path]::GetFullPath($RuntimeRoot)
$source=Join-Path $PSScriptRoot 'hermes-source.zip'
$manifest=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'runtime-manifest.json') -Raw | ConvertFrom-Json
if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.source_sha256) { throw 'Runtime source verification failed.' }
$uv=Join-Path $PSScriptRoot 'uv.exe'
if ((Get-FileHash -LiteralPath $uv -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.uv_sha256) { throw 'Runtime installer verification failed.' }
$chatManifest=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'opencode-manifest.json') -Raw | ConvertFrom-Json
if ((Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'opencode.exe') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $chatManifest.exe_sha256) { throw 'OpenCode runtime verification failed.' }
New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null
if ((Get-Item -LiteralPath $RuntimeRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked runtime directories are not supported.' }
$sdk=Join-Path $RuntimeRoot 'hermes-v0.22.5'
$state=Join-Path $RuntimeRoot 'installation.json'
$lease=[IO.File]::Open((Join-Path $RuntimeRoot 'installation.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
function Save-State($phase,$ready,$detail) {
  @{version=1;phase=$phase;runtimeReady=$ready;detail=$detail;sourceCommit=$manifest.source_commit;updated=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath $state -Encoding UTF8
}
try {
  Save-State 'runtime' $false 'Installing the private Python and official Hermes runtime. Internet access is required.'
  if (!(Test-Path -LiteralPath $sdk)) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory($source,$sdk)
  }
  if ((Get-Item -LiteralPath $sdk).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked runtime directories are not supported.' }
  if ((Get-FileHash -LiteralPath (Join-Path $sdk 'uv.lock') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.lock_sha256 -or (Get-FileHash -LiteralPath (Join-Path $sdk 'run_agent.py') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.agent_sha256) { throw 'Installed runtime source differs from this release. It was preserved; use a clean runtime directory.' }
  $env:UV_PYTHON_INSTALL_DIR=Join-Path $RuntimeRoot 'python'
  $env:UV_CACHE_DIR=Join-Path $RuntimeRoot 'download-cache'
  $env:UV_PROJECT_ENVIRONMENT=Join-Path $sdk '.venv'
  & $uv python install 3.14.10 --install-dir $env:UV_PYTHON_INSTALL_DIR --no-bin --no-registry
  if ($LASTEXITCODE -ne 0) { throw 'The private Python download failed. Retry from onboarding.' }
  $privatePython=Join-Path $env:UV_PYTHON_INSTALL_DIR 'cpython-3.14.10-windows-x86_64-none/python.exe'
  if (!(Test-Path -LiteralPath $privatePython)) { throw 'The private Python installation is incomplete.' }
  if ((Test-Path -LiteralPath $env:UV_PROJECT_ENVIRONMENT) -and ((Get-Item -LiteralPath $env:UV_PROJECT_ENVIRONMENT).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Linked runtime environments are not supported.' }
  Push-Location -LiteralPath $sdk
  try {
    # Upstream supports editable SDK installation only; retain this fixed source root.
    & $uv sync --frozen --no-dev --python $privatePython
    if ($LASTEXITCODE -ne 0) { throw 'The private AI runtime download or installation failed. Retry from onboarding.' }
  } finally { Pop-Location }
  Save-State 'docker' $true 'AI runtime installed. Checking Docker Desktop.'
  $docker=Get-Command docker.exe -ErrorAction SilentlyContinue
  $dockerInstalled=$docker -or (Test-Path -LiteralPath (Join-Path $env:ProgramFiles 'Docker/Docker/Docker Desktop.exe')) -or (Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/Docker Desktop.exe'))
  if (!$SkipDocker -and !$dockerInstalled) {
    $winget=Get-Command winget.exe -ErrorAction SilentlyContinue
    if (!$winget) { Save-State 'docker-required' $true 'Windows App Installer (winget) is missing. Install Docker Desktop using its official installer, then retry the database check.'; exit 2 }
    # Vendor installer remains interactive for license, Windows elevation and restart.
    $installed=Start-Process -FilePath $winget.Source -ArgumentList @('install','--id','Docker.DockerDesktop','--exact','--source','winget','--interactive') -Wait -PassThru
    if ($installed.ExitCode -ne 0) { Save-State 'docker-required' $true 'Docker setup was cancelled, failed, or requires a restart. Finish Docker setup, restart if requested, then return to onboarding.'; exit 2 }
  }
  if (!$SkipDocker -and !(Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue)) {
    $desktopPaths=@((Join-Path $env:ProgramFiles 'Docker/Docker/Docker Desktop.exe'),(Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/Docker Desktop.exe'))
    $desktop=$desktopPaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if ($desktop) { Start-Process -FilePath $desktop -WindowStyle Hidden }
  }
  Save-State 'installed' $true 'AI runtime installed. Start Docker Desktop, accept its setup, and complete onboarding. Windows may require virtualization, WSL or a restart.'
  exit 0
} catch {
  Save-State 'failed' $false 'Dependency setup did not finish. Retry installation in onboarding; existing workspaces were preserved.'
  Write-Error $_
  exit 1
} finally { $lease.Dispose() }
