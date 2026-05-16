$path = "src\App.tsx"
$content = Get-Content $path
$patch = Get-Content "card_patch.txt"
$newContent = $content[0..2077] + $patch + $content[2079..($content.Length-1)]
Set-Content $path $newContent -Encoding UTF8
