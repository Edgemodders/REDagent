<#
.SYNOPSIS
  Copies the REDagent package into the game, as a REDnode package.

.DESCRIPTION
  Prepares the briefing (tools/build.mjs), then mirrors redagent/ into
  <game>\red4ext\plugins\REDnode\apps\redagent, including node_modules with the
  Claude Agent SDK (about 280 MB). Deploy REDnode first, with its own
  tools\deploy-native.ps1. Close the game first.

.EXAMPLE
  .\tools\deploy.ps1 -GameDir 'E:\SteamLibrary\steamapps\common\Cyberpunk 2077'
#>
param(
    [string] $GameDir = 'C:\Program Files (x86)\Steam\steamapps\common\Cyberpunk 2077'
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$package = Join-Path $repo 'redagent'
$apps = Join-Path $GameDir 'red4ext\plugins\REDnode\apps'

if (-not (Test-Path $apps)) { throw "REDnode's apps folder is not at $apps. Deploy REDnode first." }
if (-not (Test-Path (Join-Path $package 'node_modules'))) { throw 'Run npm install in redagent first.' }

& node (Join-Path $PSScriptRoot 'build.mjs')
if ($LASTEXITCODE) { throw 'Preparing the briefing failed.' }

$target = Join-Path $apps 'redagent'
robocopy $package $target /MIR /NFL /NDL /NJH /NJS /NP /XF '*.bak' | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Copying failed (robocopy $LASTEXITCODE)." }
Write-Output "Deployed REDagent to $target"
