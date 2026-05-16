$content = Get-Content src/App.tsx
$content[3549] = '        {(isGeneratingInspiration || isGeneratingBike) && ('
$content[3550] = '          <motion.div'
$content | Set-Content src/App.tsx
