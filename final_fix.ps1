$content = Get-Content src/App.tsx
$content[3550] = '          <motion.div'
$content[3551] = '            initial={{ opacity: 0, y: 24, scale: 0.95 }}'
$content | Set-Content src/App.tsx
