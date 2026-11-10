<#
.SYNOPSIS
    Publish the trained model to the Hugging Face Model Hub and deploy the
    Flask AI server to a Hugging Face Docker Space.

.EXAMPLE
    # From the repo root
    .\deploy\publish.ps1 -HfUser gtec-trainers

.EXAMPLE
    # Only re-deploy the Space (model already uploaded)
    .\deploy\publish.ps1 -HfUser gtec-trainers -SkipModel

.NOTES
    Requires: pip install -U "huggingface_hub[cli]" and `hf auth login`
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $HfUser,

    [string] $ModelRepo = 'gtec-intent-model',
    [string] $SpaceRepo = 'gtec-ai-server',

    # Folder that contains config.json + model.safetensors + tokenizer files
    [string] $ModelDir = 'model/gtec-intent-model-v2',

    [string] $SpaceTitle = 'G-TEC AI Server',

    [switch] $SkipModel,
    [switch] $SkipSpace,
    [switch] $PrivateModel
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Write-Step($text) {
    Write-Host ""
    Write-Host "==> $text" -ForegroundColor Cyan
}

# ------------------------------------------------------------------
# 0. Locate a WORKING CLI
#
# A leftover hf.exe from an older Python install fails with:
#   "Fatal error in launcher: Unable to create process using ..."
# Running `python -m huggingface_hub.cli.hf` always uses the interpreter
# that actually has the package, so that is tried first.
# ------------------------------------------------------------------
$HfExe    = $null
$HfPrefix = @()

foreach ($py in @('python', 'py')) {
    if (-not (Get-Command $py -ErrorAction SilentlyContinue)) { continue }
    & $py -c "import huggingface_hub.cli.hf" 2>$null
    if ($LASTEXITCODE -eq 0) {
        $HfExe    = $py
        $HfPrefix = @('-m', 'huggingface_hub.cli.hf')
        break
    }
}

if (-not $HfExe) {
    foreach ($candidate in @('hf', 'huggingface-cli')) {
        $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
        if (-not $cmd) { continue }
        $probe = (& $cmd.Source --help 2>&1 | Out-String)
        if ($probe -match 'Usage:') {
            $HfExe = $cmd.Source
            break
        }
        Write-Warning "Ignoring broken launcher (stale Python install?): $($cmd.Source)"
    }
}

if (-not $HfExe) {
    throw "Hugging Face CLI not found or broken. Run: python -m pip install -U `"huggingface_hub[cli]`""
}

Write-Host "Using CLI: $HfExe $($HfPrefix -join ' ')"

function Invoke-Hf {
    param([string[]] $CliArgs)

    # The CLI prints progress and info messages to stderr. With
    # $ErrorActionPreference = 'Stop' PowerShell would turn those into
    # terminating errors, so relax it for the duration of the call.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $HfExe @HfPrefix @CliArgs 2>&1 | ForEach-Object { Write-Host $_ }
        $code = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previous
    }

    if ($code -ne 0) {
        throw "Hugging Face CLI failed (exit code $code): $HfExe $($HfPrefix -join ' ') $($CliArgs -join ' ')"
    }
}

# `hf repo create` / `hf upload` exist in huggingface_hub >= 0.27
$UseNewCli = ($HfExe -notmatch 'huggingface-cli')

# ------------------------------------------------------------------
# 1. Verify the model folder
# ------------------------------------------------------------------
if (-not $SkipModel) {
    Write-Step "Checking model folder: $ModelDir"
    if (-not (Test-Path $ModelDir)) {
        throw "Model folder not found: $ModelDir"
    }

    $weights = Get-ChildItem -Path $ModelDir -Filter 'model.safetensors' -ErrorAction SilentlyContinue
    if (-not $weights) {
        $weights = Get-ChildItem -Path $ModelDir -Filter 'pytorch_model.bin' -ErrorAction SilentlyContinue
    }
    if (-not $weights) {
        throw "No model.safetensors / pytorch_model.bin inside $ModelDir"
    }
    $sizeMb = [math]::Round(($weights | Measure-Object -Property Length -Sum).Sum / 1MB, 1)
    Write-Host "   weights: $($weights.Name) ($sizeMb MB)"

    if (-not (Test-Path (Join-Path $ModelDir 'config.json'))) {
        throw "config.json missing in $ModelDir - is this a saved transformers model?"
    }
    if (-not (Test-Path (Join-Path $ModelDir 'tokenizer.json'))) {
        Write-Warning "tokenizer.json missing in $ModelDir (AutoTokenizer may fail at runtime)"
    }
}

# ------------------------------------------------------------------
# 2. Create + upload the model repository
# ------------------------------------------------------------------
if (-not $SkipModel) {
    $ModelId = "$HfUser/$ModelRepo"
    Write-Step "Creating model repo: $ModelId"

    $createArgs = @('repos', 'create', $ModelId, '--repo-type', 'model', '--exist-ok')
    if ($PrivateModel) { $createArgs += '--private' }

    if ($UseNewCli) {
        Invoke-Hf $createArgs
    }
    else {
        # legacy CLI has no --exist-ok
        $legacyArgs = @('repo', 'create', $ModelId, '--type', 'model')
        if ($PrivateModel) { $legacyArgs += '--private' }
        Invoke-Hf $legacyArgs
    }

    Write-Step "Uploading model files to $ModelId"
    if ($UseNewCli) {
        # --exclude takes a single glob and can be repeated
        Invoke-Hf @('upload', $ModelId, $ModelDir, '--repo-type=model',
            '--exclude', 'training_args.bin',
            '--exclude', 'trainer_state.json',
            '--exclude', 'checkpoint-*',
            '--exclude', 'runs/*')
    }
    else {
        Invoke-Hf @('upload', $ModelId, $ModelDir, '--repo-type=model')
    }

    # Lite model used by free hosting (Render 512 MB). Trained by
    # train_lite_model.py, ~1 MB, no torch needed at runtime.
    if (Test-Path 'model/gtec-intent-lite.joblib') {
        Write-Step "Uploading lite model (intent_clf.joblib)"
        Invoke-Hf @('upload', $ModelId, 'model/gtec-intent-lite.joblib',
            'intent_clf.joblib', '--repo-type=model')
        if (Test-Path 'model/gtec-intent-lite-meta.json') {
            Invoke-Hf @('upload', $ModelId, 'model/gtec-intent-lite-meta.json',
                'intent_clf_meta.json', '--repo-type=model')
        }
    }
    else {
        Write-Warning "model/gtec-intent-lite.joblib not found - run train_lite_model.py to build the free-hosting model."
    }
}

# ------------------------------------------------------------------
# 3 + 4. Create the Docker Space and upload its files
#
# NOTE (2026): Hugging Face requires a PRO plan to create Docker or
# Gradio Spaces. Static Spaces are still free. This block therefore
# degrades gracefully: the model upload above is the important part.
# ------------------------------------------------------------------
$SpaceError = $null

if (-not $SkipSpace) {
    $SpaceId = "$HfUser/$SpaceRepo"
    try {
        Write-Step "Creating Docker Space: $SpaceId"

        if ($UseNewCli) {
            Invoke-Hf @('repos', 'create', $SpaceId, '--repo-type', 'space', '--space-sdk', 'docker', '--exist-ok')
        }
        else {
            Invoke-Hf @('repo', 'create', $SpaceId, '--type', 'space', '--space_sdk', 'docker')
        }

        $Stage = Join-Path ([System.IO.Path]::GetTempPath()) "gtec-space-stage"
        if (Test-Path $Stage) { Remove-Item $Stage -Recurse -Force }
        New-Item -ItemType Directory -Path $Stage | Out-Null

        Write-Step "Staging Space files in $Stage"
        Copy-Item 'ai_server.py'                         (Join-Path $Stage 'ai_server.py')
        Copy-Item 'deploy/hf-space/requirements.txt'     (Join-Path $Stage 'requirements.txt')
        Copy-Item 'deploy/hf-space/Dockerfile'           (Join-Path $Stage 'Dockerfile')
        Copy-Item 'deploy/hf-space/README.md'            (Join-Path $Stage 'README.md')

        # Point the Space at the model repo via the README metadata
        $readme = Get-Content (Join-Path $Stage 'README.md') -Raw
        $readme = $readme -replace 'title: .*', "title: $SpaceTitle"
        Set-Content (Join-Path $Stage 'README.md') -Value $readme -Encoding utf8

        Write-Step "Uploading to $SpaceId"
        Invoke-Hf @('upload', $SpaceId, $Stage, '--repo-type=space')

        $spaceHost = "$HfUser-$SpaceRepo".ToLower().Replace('_', '-').Replace('.', '-')
        Write-Host ""
        Write-Host "Space page : https://huggingface.co/spaces/$SpaceId" -ForegroundColor Green
        Write-Host "Direct API : https://$spaceHost.hf.space" -ForegroundColor Green
    }
    catch {
        $SpaceError = $_.Exception.Message
    }
}

if ($SpaceError) {
    Write-Host ""
    Write-Host "----------------------------------------------------------" -ForegroundColor Yellow
    Write-Host " Space deployment skipped / failed" -ForegroundColor Yellow
    Write-Host "----------------------------------------------------------" -ForegroundColor Yellow
    Write-Host $SpaceError -ForegroundColor DarkYellow
    Write-Host ""
    Write-Host "Hugging Face requires a PRO plan ($9/mo) to create Docker or" -ForegroundColor Yellow
    Write-Host "Gradio Spaces. Free accounts can only create Static Spaces," -ForegroundColor Yellow
    Write-Host "which cannot run a Python/Flask server." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Your model WAS uploaded successfully. You can still:" -ForegroundColor Green
    Write-Host "  1. Host ai_server.py on Render / Railway / Fly.io / Cloud Run (free tiers)"
    Write-Host "  2. Subscribe to HF PRO and re-run:"
    Write-Host "     .\deploy\publish.ps1 -HfUser $HfUser -SkipModel"
    Write-Host "  3. Run the AI server on your own machine / LAN for local demos"
    Write-Host ""
}

# ------------------------------------------------------------------
# Summary
# ------------------------------------------------------------------
Write-Host ""
if (-not $SkipModel) {
    Write-Host "Model repo : https://huggingface.co/$HfUser/$ModelRepo" -ForegroundColor Green
    Write-Host "MODEL_ID   : $HfUser/$ModelRepo" -ForegroundColor Green
}
if (-not $SpaceError -and -not $SkipSpace) {
    Write-Host "Space repo : https://huggingface.co/spaces/$HfUser/$SpaceRepo" -ForegroundColor Green
}
Write-Host ""
Write-Host "Done." -ForegroundColor Green
