$content = Get-Content src/App.tsx
$newBlock = "            handleGenerateBikeRoute={handleGenerateBikeRoute}"
$newBlock2 = "            isGeneratingBike={isGeneratingBike}"
$newContent = $content[0..3408] + $newBlock + $newBlock2 + $content[3409..($content.Length-1)]
$newContent | Set-Content src/App.tsx
