$content = Get-Content src/App.tsx
$newContent = $content[0..3551] + '            animate={{ opacity: 1, y: 0,  scale: 1    }}' + $content[3552..($content.Length-1)]
$newContent | Set-Content src/App.tsx
