# ProfitLands World 1 -- Cloudflare Free-only release.
# Launch from PowerShell on the account owner's PC. Wrangler opens an OAuth window.
# This script never upgrades plans, deletes D1 data, or deploys Firebase Cloud Functions.
param([switch]$SkipLogin)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$here=Split-Path -Parent $MyInvocation.MyCommand.Path
$config=Join-Path $here 'wrangler.toml'
$schema=Join-Path $here 'schema.sql'
$database='profitlands-world1'
$workerUrl='https://profitlands-world1.winotbill.workers.dev'
$gameOrigin='https://profitlands.winotbill.workers.dev'
$wranglerVersion='wrangler@4.158.0'
$npxCommand=Get-Command 'npx.cmd' -ErrorAction SilentlyContinue
$npx=if($null -ne $npxCommand){$npxCommand.Source}else{''}
if(-not $npx -and (Test-Path 'C:\Program Files\nodejs\npx.cmd')){$npx='C:\Program Files\nodejs\npx.cmd'}
if(-not $npx){throw 'Node.js / npx was not found. Install Node.js 22+.'}
if(-not (Test-Path $config) -or -not (Test-Path $schema)){throw 'Missing World 1 files.'}
# Fail closed before logging in, touching D1 or uploading the Worker.
# The live API may be newer than main while feature work is still unmerged.
$source=Join-Path $here 'src\index.mjs'
if(-not (Test-Path $source)){throw 'Missing Worker source for release preflight.'}
$versionMatch=[regex]::Match([IO.File]::ReadAllText($source),'(?m)^\s*const API_VERSION\s*=\s*(\d+)\s*;')
if(-not $versionMatch.Success){throw 'Local Worker API_VERSION is missing. Deployment stopped.'}
$localVersion=[int]$versionMatch.Groups[1].Value
try {
  $live=Invoke-RestMethod -Uri ($workerUrl+'/health') -TimeoutSec 12 -ErrorAction Stop
} catch {
  throw 'Cannot verify live Worker API version. Deployment stopped before any D1 changes.'
}
$liveVersion=0
if($live.ok -ne $true -or -not [int]::TryParse([string]$live.version,[ref]$liveVersion)){
  throw 'Live Worker health/version is invalid. Deployment stopped.'
}
if($liveVersion -gt $localVersion){
  throw ("Refusing Worker API rollback: live v{0} is newer than local v{1}. Reconcile the deployed source first." -f $liveVersion,$localVersion)
}
Write-Host ("Worker preflight passed: live v{0}, local v{1}." -f $liveVersion,$localVersion)
Push-Location $here
try {
  Write-Host 'Checking Cloudflare sign-in...'
  $identity=(& $npx -y $wranglerVersion whoami 2>&1 | Out-String)
  if($identity -match 'not authenticated|not logged in'){
    if($SkipLogin){throw 'Cloudflare is not signed in. Run this script without -SkipLogin.'}
    Write-Host 'Please approve the Cloudflare Wrangler login in the browser on this PC.'
    & $npx -y $wranglerVersion login
    if($LASTEXITCODE -ne 0){throw 'Cloudflare authorization was not completed.'}
  } elseif($LASTEXITCODE -ne 0){
    throw 'Could not verify Cloudflare account access.'
  }
  $identity=(& $npx -y $wranglerVersion whoami 2>&1 | Out-String)
  if($identity -match 'not authenticated|not logged in'){throw 'Cloudflare authorization is still missing.'}
  Write-Host 'Reading existing D1 databases (no data is deleted)...'
  $listOutput=(& $npx -y $wranglerVersion d1 list --json 2>&1 | Out-String)
  if($LASTEXITCODE -ne 0){throw ('Could not list D1 databases: '+$listOutput)}
  try {
    $payload=ConvertFrom-Json -InputObject $listOutput
    if($null -eq $payload){$items=@()}
    elseif($payload -is [array]){$items=@($payload)}
    elseif($payload.PSObject.Properties.Name -contains 'result'){$items=@($payload.result)}
    else{$items=@($payload)}
  } catch {throw 'Could not parse Wrangler D1 list JSON. No changes were made.'}
  $found=@($items | Where-Object { $_.name -eq $database })
  if($found.Count -gt 1){throw 'Multiple matching D1 databases found; aborting to avoid an unsafe selection.'}
  if($found.Count -eq 0){
    if($items.Count -ge 10){throw 'Free D1 database limit may be reached. No paid database will be created.'}
    Write-Host 'Creating one D1 Free database for World 1...'
    & $npx -y $wranglerVersion d1 create $database --location wnam
    if($LASTEXITCODE -ne 0){throw 'D1 creation failed. No paid services were enabled.'}
    $listOutput=(& $npx -y $wranglerVersion d1 list --json 2>&1 | Out-String)
    if($LASTEXITCODE -ne 0){throw 'Could not inspect the new D1 database.'}
    $payload=ConvertFrom-Json -InputObject $listOutput
    if($null -eq $payload){$items=@()}
    elseif($payload -is [array]){$items=@($payload)}
    elseif($payload.PSObject.Properties.Name -contains 'result'){$items=@($payload.result)}
    else{$items=@($payload)}
    $found=@($items | Where-Object { $_.name -eq $database })
  }else{Write-Host 'Reusing the existing D1 database.'}
  if($found.Count -ne 1){throw 'Could not identify the World 1 D1 database.'}
  $id=''
  if($found[0].PSObject.Properties.Name -contains 'uuid'){$id=[string]$found[0].uuid}
  if((-not $id -or $id -notmatch '^[0-9a-fA-F-]{36}$') -and ($found[0].PSObject.Properties.Name -contains 'id')){
    $id=[string]$found[0].id
  }
  if($id -notmatch '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'){
    throw 'The D1 database did not return a valid UUID.'
  }
  $old=[IO.File]::ReadAllText($config)
  $pattern='(?m)^database_id\s*=\s*"[^"]*"\s*$'
  if(-not [regex]::IsMatch($old,$pattern)){throw 'D1 config database_id entry not found.'}
  $new=[regex]::Replace($old,$pattern,('database_id = "'+$id+'"'))
  if($old -ne $new){
    [IO.File]::Copy($config,($config+'.before-world1-deploy.bak'),$true)
    [IO.File]::WriteAllText($config,$new,([System.Text.UTF8Encoding]::new($false)))
    Write-Host 'Bound the real D1 UUID; previous local configuration was backed up.'
  }
  Write-Host 'Initializing D1 schema without deleting existing game data...'
  & $npx -y $wranglerVersion d1 execute $database --remote --file $schema --yes
  if($LASTEXITCODE -ne 0){throw 'D1 schema initialization failed. Multiplayer not deployed.'}
  Write-Host 'Deploying only the existing profitlands-world1 Worker...'
  & $npx -y $wranglerVersion deploy --config $config
  if($LASTEXITCODE -ne 0){throw 'Worker deployment failed. The website remains unchanged.'}
  $response=Invoke-WebRequest -Uri ($workerUrl+'/health') -Headers @{Origin=$gameOrigin} -UseBasicParsing -TimeoutSec 25
  $data=ConvertFrom-Json -InputObject $response.Content
  if([int]$response.StatusCode -ne 200 -or $data.ok -ne $true -or $data.worldId -ne 'world1' -or
    $response.Headers['Access-Control-Allow-Origin'] -ne $gameOrigin){
      throw 'World 1 health check failed or CORS is not enabled. Do not enable client connections.'
  }
  Write-Host ('WORLD1_DEPLOYED_AND_HEALTHY '+$workerUrl)
  Write-Host 'Next: merge the verified ProfitLands frontend config PR and test with two signed-in accounts.'
}finally{Pop-Location}
