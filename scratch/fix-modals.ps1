$dir = "c:\global supply chain\globalchain-mobile\src\pages"
$files = Get-ChildItem $dir -Filter '*.tsx'
foreach ($f in $files) {
  $content = Get-Content $f.FullName -Raw
  $updated = $content -replace 'overflow-y-auto flex items-start justify-center p-4 pt-12', 'flex items-center justify-center p-4'
  $updated2 = $updated -replace 'space-y-4 my-auto">', 'space-y-4 max-h-[88vh] overflow-y-auto">'
  Set-Content -Path $f.FullName -Value $updated2 -NoNewline
  Write-Host "Fixed: $($f.Name)"
}
