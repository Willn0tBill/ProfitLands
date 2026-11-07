# Owner-PC-only private D1 snapshots. Never commits data or tokens.
# Scheduled tasks run after login if the PC was off at the scheduled time.
# Backups are hashed and retained for at least five versions and fourteen days.
$ErrorActionPreference='Stop'
$root='D:\ProfitLands_Contract_QA'
$private='D:\ProfitLands_Backups'
$wrangler=Join-Path $root 'cloudflare\node_modules\wrangler\bin\wrangler.js'
$config=Join-Path $root 'cloudflare\wrangler.toml'
if(!(Test-Path $wrangler)){throw 'Wrangler is missing'}
New-Item -ItemType Directory -Path $private -Force | Out-Null
$utc=(Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss')
$dest=Join-Path $private "profitlands-world1-daily-$utc.sql"
$shaFile="$dest.sha256"
$log=Join-Path $private 'profitlands-daily-backup-status.log'
Push-Location $root
try{
  # Wrangler prints a short-lived signed download URL; never save or log it.
  $priorPreference=$ErrorActionPreference
  $ErrorActionPreference='Continue'
  try{
    & node $wrangler d1 export profitlands-world1 --config $config --remote --output $dest *> $null
    $exportCode=$LASTEXITCODE
  }finally{$ErrorActionPreference=$priorPreference}
  if($exportCode -ne 0){throw "D1 export command failed (code $exportCode). Check Wrangler authentication and quota."}
  $item=Get-Item -LiteralPath $dest -ErrorAction Stop
  if($item.Length -lt 128){throw 'Export is suspiciously small'}
  $start=Get-Content -LiteralPath $dest -TotalCount 28
  if(-not (($start -join ' ') -match 'CREATE TABLE|INSERT INTO|PRAGMA')){
    throw 'Export does not resemble SQLite SQL'
  }
  $hash=(Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash.ToLowerInvariant()
  Set-Content -LiteralPath $shaFile -Value "$hash  $($item.Name)" -Encoding ascii
  if((Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash){
    throw 'SHA256 verification failed'
  }
  Add-Content -LiteralPath $log -Value "$((Get-Date).ToUniversalTime().ToString('o')) SUCCESS file=$($item.Name) bytes=$($item.Length) sha256=$hash"
  # Keep five snapshots minimum. Never delete the frozen migration backups.
  $daily=@(Get-ChildItem -LiteralPath $private -Filter 'profitlands-world1-daily-*.sql' -File | Sort-Object LastWriteTimeUtc -Descending)
  $expired=@($daily | Select-Object -Skip 5 | Where-Object {$_.LastWriteTimeUtc -lt (Get-Date).ToUniversalTime().AddDays(-14)})
  foreach($old in $expired){
    $oldHash="$($old.FullName).sha256"
    if(Test-Path -LiteralPath $oldHash){Remove-Item -LiteralPath $oldHash -Force}
    Remove-Item -LiteralPath $old.FullName -Force
  }
  Write-Output "PRIVATE_D1_BACKUP_PASS file=$($item.Name) bytes=$($item.Length) sha256=$hash"
}catch{
  Add-Content -LiteralPath $log -Value "$((Get-Date).ToUniversalTime().ToString('o')) FAILURE $($_.Exception.Message)"
  if(Test-Path -LiteralPath $dest){Remove-Item -LiteralPath $dest -Force}
  if(Test-Path -LiteralPath $shaFile){Remove-Item -LiteralPath $shaFile -Force}
  throw
}finally{Pop-Location}
