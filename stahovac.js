import fs from 'fs';

// Zde jsou všechny hlavní sekce z Antigravity dokumentace
const pages = [
    '/docs/get-started',
    '/docs/models',
    '/docs/agent-modes-settings',
    '/docs/agent-permissions',
    '/docs/rules-workflows',
    '/docs/skills',
    '/docs/task-groups',
    '/docs/browser-subagent',
    '/docs/strict-mode',
    '/docs/sandbox-mode',
    '/docs/mcp',
    '/docs/task-list',
    '/docs/implementation-plan',
    '/docs/knowledge',
    '/docs/allowlist-denylist',
    '/docs/faq'
];

const baseUrl = 'https://antigravity.google';
// Použijeme službu Jina, která z webu vytáhne rovnou čistý Markdown pro AI
const jinaUrl = 'https://r.jina.ai/';

async function downloadDocs() {
    console.log('🚀 Spouštím stahování dokumentace Antigravity...\n');
    let fullDocs = '# Kompletní dokumentace Google Antigravity\n\n';

    for (const page of pages) {
        const targetUrl = `${baseUrl}${page}`;
        console.log(`Stahuji: ${targetUrl}`);

        try {
            // Nativní fetch dostupný v moderním Node.js
            const response = await fetch(`${jinaUrl}${targetUrl}`);
            if (response.ok) {
                const markdown = await response.text();
                fullDocs += `\n\n---\n\n## Zdroj: ${targetUrl}\n\n`;
                fullDocs += markdown;
                console.log(`✅ Úspěšně staženo.`);
            } else {
                console.log(`❌ Chyba při stahování ${targetUrl}: ${response.status}`);
            }
        } catch (error) {
            console.log(`❌ Chyba sítě u ${targetUrl}: ${error.message}`);
        }

        // Počkáme 2 vteřiny před dalším stažením, abychom neblokovali server
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Uložení celého textu do jednoho velkého souboru
    fs.writeFileSync('antigravity_komplet.md', fullDocs, 'utf8');
    console.log('\n🎉 Hotovo! Dokumentace je uložena v souboru "antigravity_komplet.md"');
}

downloadDocs();