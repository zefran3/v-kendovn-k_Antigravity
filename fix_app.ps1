$content = Get-Content src/App.tsx
$fix = Get-Content temp_fix.txt
$newContent = $content[0..673] + $fix + $content[678..($content.Length-1)]
$newContent | Set-Content src/App.tsx
