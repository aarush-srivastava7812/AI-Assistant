param([switch]$Live, [switch]$Neural, [switch]$NodeBridge, [switch]$ClientOnly, [switch]$Packaged, [switch]$Chat, [switch]$RebuildContracts, [switch]$All, [switch]$Recovery)
$ErrorActionPreference = 'Stop'
$appRoot = Split-Path $PSScriptRoot -Parent
$projectRoot = Split-Path $appRoot -Parent
$python = @($env:WAYFINDER_PYTHON, (Join-Path $projectRoot '.local\test-env\Scripts\python.exe'), (Join-Path $projectRoot '.venv\Scripts\python.exe'), (Join-Path (Split-Path $projectRoot -Parent) 'reserchpaper\.venv\Scripts\python.exe')) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $python) { throw 'Existing configured Python environment required.' }
$testIdentity = [Guid]::NewGuid().ToString('N')
$containerName = 'wayfinder-electron-tests-' + $testIdentity
$testRoot = Join-Path $env:TEMP $containerName
$reports = Join-Path $appRoot 'test-results'
New-Item -ItemType Directory -Force -Path $reports | Out-Null
$previousHost = $env:FALKORDB_HOST
$previousPort = $env:FALKORDB_PORT
$previousLive = $env:WAYFINDER_PLATFORM_LIVE
$testExit = 1
Push-Location $projectRoot
try {
    docker image inspect falkordb/falkordb:v4.20.7 --format '{{.Id}}' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Pinned existing test image unavailable; no image pull performed.' }
    docker run -d --name $containerName -p '127.0.0.1::6379' --tmpfs /data -e 'REDIS_ARGS=--appendonly no' -e 'BROWSER=0' falkordb/falkordb:v4.20.7 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not create isolated test database.' }
    $binding = docker port $containerName 6379/tcp
    if ($binding -notmatch '^127\.0\.0\.1:(\d+)$') { throw 'Unexpected database port binding.' }
    $env:FALKORDB_HOST = '127.0.0.1'
    $env:FALKORDB_PORT = $Matches[1]
    $env:WAYFINDER_PLATFORM_LIVE = '0'
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        $ErrorActionPreference = 'Continue'
        $pong = docker exec $containerName redis-cli ping 2>$null
        $ErrorActionPreference = 'Stop'
        if ($pong -eq 'PONG') { $ready = $true; break }
        Start-Sleep -Milliseconds 250
    }
    if (-not $ready) { throw 'Isolated database not ready.' }
    $files = @('desktop-app/backend/test_host.py', 'tests/test_wayfinder_app.py', 'tests/test_desktop_workers.py', 'tests/test_platform_integration.py', 'tests/test_platform_git.py', 'tests/test_platform_memory.py', 'tests/test_platform_sources.py', 'tests/test_google_setup.py', 'tests/test_approval_service.py', 'tests/test_atlas_helpers.py', 'tests/test_integration_action_safety.py', 'wayfinder/workers')
    $files += @('tests/test_google_content.py','tests/test_bounded_workflows.py','tests/test_worker_bindings.py','tests/test_platform_contracts.py','tests/test_task_profiles.py','tests/test_preset_tasks.py','tests/test_chat.py','tests/test_connections.py','tests/test_connection_boundaries.py')
    $selection = @('-k', 'not desktop_worker_controls_and_space_switch')
    $reportName = 'backend.xml'
    if ($All) { $files = @('tests','desktop-app/backend/test_host.py','wayfinder/workers'); $reportName = 'full-backend.xml' }
    if ($Recovery) { $files = @('tests/test_context_service.py','tests/test_maintenance.py','tests/test_memory_reliability_fixes.py','tests/test_shared_memory_service.py','tests/test_file_context.py','tests/test_worker_ledger.py','tests/test_preset_tasks.py','tests/test_bounded_workflows.py','tests/test_task_profiles.py'); $reportName = 'recovery-backend.xml' }
    if ($Chat) { $files = @('tests/test_chat.py'); $reportName = 'chat-contract.xml' }
    if ($RebuildContracts) { $files = @('tests/test_google_content.py','tests/test_bounded_workflows.py','tests/test_worker_bindings.py','tests/test_platform_contracts.py','tests/test_task_profiles.py','tests/test_chat.py'); $reportName = 'rebuild-contracts.xml' }
    if ($ClientOnly) { $files = @('desktop-app/backend/test_host.py'); $reportName = 'client-adapter.xml' }
    if ($Live) { $env:WAYFINDER_PLATFORM_LIVE = '1'; $selection = @('-k', 'live_installed_hermes_read_workflow'); $reportName = 'live-hermes.xml' }
    if ($Packaged) {
        New-Item -ItemType Directory -Force -Path $testRoot | Out-Null
        node (Join-Path $appRoot 'scripts\verify-packaged.mjs') (Join-Path $testRoot 'packaged-runtime') (Join-Path $reports 'packaged.json')
    } elseif ($NodeBridge) {
        New-Item -ItemType Directory -Force -Path $testRoot | Out-Null
        node (Join-Path $appRoot 'scripts\verify-node-bridge.mjs') (Join-Path $testRoot 'node-runtime') (Join-Path $reports 'node-bridge.json')
    } elseif ($Neural) {
        New-Item -ItemType Directory -Force -Path $testRoot | Out-Null
        $liveArgs = @()
        if ($Live) { $liveArgs = @('--live') }
        & $python -B (Join-Path $appRoot 'backend\verify_transport.py') --runtime (Join-Path $testRoot 'runtime') --report (Join-Path $reports 'actual-transport.json') @liveArgs
    } else {
        & $python -B -m pytest @files @selection -q --tb=short -p no:cacheprovider --basetemp $testRoot --junitxml (Join-Path $reports $reportName)
    }
    $testExit = $LASTEXITCODE
    if ($testExit -ne 0) {
        $ErrorActionPreference = 'Continue'
        docker exec $containerName redis-cli INFO stats | Set-Content -Encoding UTF8 (Join-Path $reports 'failed-database-stats.txt')
        docker exec $containerName redis-cli CONFIG GET maxmemory maxmemory-policy | Set-Content -Encoding UTF8 (Join-Path $reports 'failed-database-config.txt')
        $ErrorActionPreference = 'Stop'
    }
} finally {
    # Cleanup must not mask the original test/startup failure in Windows PS 5.
    $cleanupPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    docker rm -f -v $containerName 2>$null | Out-Null
    $ErrorActionPreference = $cleanupPreference
    $env:FALKORDB_HOST = $previousHost
    $env:FALKORDB_PORT = $previousPort
    $env:WAYFINDER_PLATFORM_LIVE = $previousLive
    Pop-Location
}
exit $testExit
