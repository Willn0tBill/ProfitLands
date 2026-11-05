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
$npx=(Get-Command 'npx.cmd' -ErrorAction SilentlyContinue).Source
if(-not $npx -and (Test-Path 'C:\Program Files\nodejs\npx.cmd')){$npx='C:\Program Files\nodejs\npx.cmd'}
if(-not $npx){throw 'Node.js / npx was not found. Install Node.js 22+.'}
if(-not (Test-Path $config) -or -not (Test-Path $schema)){throw 'Missing World 1 files.'}
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
    if($null -ne $payload.result){$items=@($payload.result)}else{$items=@($payload)}
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
    if($null -ne $payload.result){$items=@($payload.result)}else{$items=@($payload)}
    $found=@($items | Where-Object { $_.name -eq $database })
  }else{Write-Host 'Reusing the existing D1 database.'}
  if($found.Count -ne 1){throw 'Could not identify the World 1 D1 database.'}
  $id=[string]$found[0].uuid
  if(-not $id -or $id -notmatch '^[0-9a-fA-F-]{36}$'){
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
    [IO.File]::WriteAllText($config,$new,(New-Object System.Text.UTF8Encoding($false)))
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
