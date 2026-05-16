$content = Get-Content src/App.tsx
$content[3549] = '        {(isGeneratingInspiration || isGeneratingBike) && ('
$content | Set-Content src/App.tsx
