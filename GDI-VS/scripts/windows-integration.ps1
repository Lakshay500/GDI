[CmdletBinding()]
param(
    [ValidateSet('Prepare','Validate','Start','Smoke','CoreSmoke','Status','Logs','Stop')]
    [string]$Action = 'Prepare',
    [int]$ReadyTimeoutMinutes = 15
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $RepoRoot

function New-RandomUrlToken([int]$ByteCount) {
    $bytes = New-Object byte[] $ByteCount
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
}

function Assert-DockerReady {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Docker CLI not found. Install/start Docker Desktop with the WSL2 backend, then reopen PowerShell.'
    }
    docker version --format '{{.Server.Version}}' 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker Engine is not reachable. Start Docker Desktop and ensure its Linux engine is running.'
    }
    docker compose version | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose v2 is unavailable.' }
}

function Prepare-Environment {
    $envPath = Join-Path $RepoRoot '.env'
    if (Test-Path $envPath) {
        Write-Host '.env already exists; leaving it untouched.' -ForegroundColor Yellow
        return
    }
    $examplePath = Join-Path $RepoRoot '.env.example'
    if (-not (Test-Path $examplePath)) { throw '.env.example is missing.' }
    $content = Get-Content -Raw -Path $examplePath
    $replacements = @{
        'replace-with-a-local-development-secret' = (New-RandomUrlToken 32)
        'replace-with-a-random-secret-of-at-least-32-characters' = (New-RandomUrlToken 48)
        'replace-with-a-long-random-internal-token' = (New-RandomUrlToken 48)
        'replace-with-a-long-random-grafana-password' = (New-RandomUrlToken 32)
    }
    foreach ($placeholder in $replacements.Keys) {
        $content = $content.Replace($placeholder, $replacements[$placeholder])
    }
    $ipfsBytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($ipfsBytes) } finally { $rng.Dispose() }
    $ipfsKey = [Convert]::ToBase64String($ipfsBytes).TrimEnd('=').Replace('+','-').Replace('/','_')
    $content = $content.Replace('IPFS_ENCRYPTION_KEY=', "IPFS_ENCRYPTION_KEY=$ipfsKey")
    Set-Content -Path $envPath -Value $content -Encoding ascii
    Write-Host 'Created .env with fresh local-only secrets. The file is git-ignored.' -ForegroundColor Green
    Write-Host 'Back up IPFS_ENCRYPTION_KEY securely; losing it makes encrypted IPFS objects unrecoverable.' -ForegroundColor Yellow
    Write-Host 'PUBLIC_VERIFY_BASE_URL remains an example placeholder. Replace it before testing externally shared QR links.' -ForegroundColor Yellow
}

function Validate-Stack {
    Assert-DockerReady
    if (-not (Test-Path (Join-Path $RepoRoot '.env'))) {
        throw 'Missing .env. Run: .\scripts\windows-integration.ps1 -Action Prepare'
    }
    docker compose config --quiet
    if ($LASTEXITCODE -ne 0) { throw 'docker compose config failed; resolve the reported configuration errors.' }
    Write-Host 'Docker Engine, Compose v2 and Compose configuration checks passed.' -ForegroundColor Green
}

function Wait-ForApi {
    $deadline = (Get-Date).AddMinutes($ReadyTimeoutMinutes)
    $uri = 'http://127.0.0.1:8000/ready'
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-RestMethod -Uri $uri -TimeoutSec 4
            if ($response.status -eq 'ready') {
                Write-Host 'API readiness check passed.' -ForegroundColor Green
                return
            }
        } catch { }
        Start-Sleep -Seconds 5
    }
    Write-Warning 'API did not become ready within the configured timeout. Recent service logs follow.'
    docker compose ps
    docker compose logs --tail=100 migrate api document-worker outbox-scheduler clamav ipfs
    throw 'Startup readiness timed out. Do not treat the deployment as accepted.'
}

switch ($Action) {
    'Prepare' {
        Prepare-Environment
        Write-Host 'Next: .\scripts\windows-integration.ps1 -Action Validate'
    }
    'Validate' { Validate-Stack }
    'Start' {
        Validate-Stack
        docker compose up --build -d
        if ($LASTEXITCODE -ne 0) { throw 'docker compose up failed.' }
        Wait-ForApi
        docker compose ps
    }
    'Smoke' {
        Assert-DockerReady
        if (-not (Get-Command python -ErrorAction SilentlyContinue)) { throw 'Python 3 is required to run scripts/acceptance-smoke.py.' }
        New-Item -ItemType Directory -Force -Path (Join-Path $RepoRoot 'local-evidence') | Out-Null
        python scripts/acceptance-smoke.py --base-url http://127.0.0.1:8000 --output local-evidence/windows-smoke.json
        if ($LASTEXITCODE -ne 0) { throw 'Smoke checks failed. Inspect local-evidence/windows-smoke.json.' }
        Write-Host 'Smoke report saved to local-evidence/windows-smoke.json (local-only, git-ignored).' -ForegroundColor Green
        Write-Host 'This report does not prove the 13 mandatory end-to-end acceptance scenarios.' -ForegroundColor Yellow
    }
    'CoreSmoke' {
        Assert-DockerReady
        if (-not (Get-Command python -ErrorAction SilentlyContinue)) { throw 'Python 3 is required to run scripts/acceptance-smoke.py.' }
        New-Item -ItemType Directory -Force -Path (Join-Path $RepoRoot 'local-evidence') | Out-Null
        python scripts/acceptance-smoke.py --base-url http://127.0.0.1:8000 --require-core-dependencies --output local-evidence/windows-core-integration.json
        if ($LASTEXITCODE -ne 0) { throw 'Core dependency smoke checks failed. Inspect local-evidence/windows-core-integration.json and service logs.' }
        Write-Host 'API and core dependency health gates passed. Fabric remains a separate profile and acceptance gate.' -ForegroundColor Green
    }
    'Status' { Assert-DockerReady; docker compose ps }
    'Logs' { Assert-DockerReady; docker compose logs -f --tail=200 }
    'Stop' { Assert-DockerReady; docker compose down; if ($LASTEXITCODE -ne 0) { throw 'docker compose down failed.' }; Write-Host 'Containers stopped; named volumes and persisted data were preserved.' }
}
