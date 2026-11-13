[CmdletBinding()]
param(
    [string]$Remote = "origin",
    [string]$Branch = "gh-pages",
    [string]$Message = "",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

if (@("main", "master") -contains $Branch) { throw "refusing to publish to $Branch" }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "git not found on PATH" }

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here
$site = Join-Path $root "docs"
$index = Join-Path $site "index.html"
$dataDir = Join-Path $site "data"
$graph = Join-Path $dataDir "graph.json"
$web = Join-Path $root "web"

if (-not (Test-Path (Join-Path $web "package.json"))) { throw "web/package.json not found" }
Push-Location $web
try {
    pnpm build
    if ($LASTEXITCODE -ne 0) { throw "pnpm build failed (exit code $LASTEXITCODE)" }
} finally {
    Pop-Location
}

if (-not (Test-Path $index)) { throw "docs/index.html not found" }
if (-not (Test-Path (Join-Path $site "assets"))) { throw "docs/assets not found" }
if (-not (Test-Path $graph)) { throw "docs/data/graph.json not found; run run.ps1 or uv run scriptindexer-extract plus scriptindexer-build first" }
$heads = @(Get-ChildItem -Path $dataDir -Filter "text-*-head.json" -File -ErrorAction SilentlyContinue)
if (-not $heads.Count) { throw "docs/data/text-*-head.json not found; run uv run scriptindexer-build first" }

$remoteUrl = git -C $root remote get-url $Remote 2>$null
if ($LASTEXITCODE -ne 0 -or -not $remoteUrl) { throw "remote '$Remote' is not configured in $root" }

$stamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss")
if (-not $Message) { $Message = "deploy: publish static site at $stamp UTC" }

$temp = Join-Path ([System.IO.Path]::GetTempPath()) ("scriptindexer-pages-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $temp -Force | Out-Null

try {
    Get-ChildItem -Path $site -Force | Copy-Item -Destination $temp -Recurse -Force
    if (-not (Test-Path (Join-Path $temp ".nojekyll"))) {
        New-Item -ItemType File -Path (Join-Path $temp ".nojekyll") -Force | Out-Null
    }

    $bytes = (Get-ChildItem -Path $temp -Recurse -Force -File | Measure-Object -Property Length -Sum).Sum
    Write-Host ("staged docs: {0:N1} MB" -f ($bytes / 1MB)) -ForegroundColor Cyan

    Push-Location $temp
    try {
        git init --quiet
        git checkout --quiet -b $Branch
        git add -A
        $count = @(git ls-files).Count
        Write-Host ("site files: {0} -> {1} ({2})" -f $count, $Branch, $remoteUrl) -ForegroundColor Cyan

        if ($DryRun) {
            Write-Host ("dry run: staged at {0}" -f $temp) -ForegroundColor Yellow
        } else {
            git remote add origin $remoteUrl
            git commit --quiet -m $Message
            if ($LASTEXITCODE -ne 0) { throw "git commit failed (exit code $LASTEXITCODE)" }
            git push --force origin $Branch
            if ($LASTEXITCODE -ne 0) { throw "git push failed (exit code $LASTEXITCODE)" }
            Write-Host "published: set the GitHub Pages source to the $Branch branch" -ForegroundColor Green
        }
    } finally {
        Pop-Location
    }
} finally {
    if (-not $DryRun -and (Test-Path $temp)) { Remove-Item -Path $temp -Recurse -Force }
}
