const fs = require('fs');
const t = fs.readFileSync('e:/horae/index.js', 'utf8');
const lines = t.split('\n');

function removeFunction(funcName) {
    let start = -1, end = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(`function ${funcName}`) || lines[i].includes(`async function ${funcName}`)) {
            // Include preceding JSDoc comments if any
            start = i;
            while (start > 0 && (lines[start - 1].trim().startsWith('/**') || lines[start - 1].trim().startsWith('*'))) {
                start--;
            }
            // Find closing brace
            let braceCount = 0;
            let foundBrace = false;
            for (let j = i; j < lines.length; j++) {
                if (lines[j].includes('{')) { braceCount += (lines[j].match(/{/g) || []).length; foundBrace = true; }
                if (lines[j].includes('}')) { braceCount -= (lines[j].match(/}/g) || []).length; }
                if (foundBrace && braceCount === 0) {
                    end = j;
                    break;
                }
            }
            break;
        }
    }
    if (start !== -1 && end !== -1) {
        lines.splice(start, end - start + 1);
        console.log(`Removed ${funcName}`);
    } else {
        console.log(`Could not remove ${funcName}`);
    }
}

removeFunction('getTemplate');
removeFunction('loadSettings');
removeFunction('saveSettings');
removeFunction('showToast');

// Remove let settings = { ...DEFAULT_SETTINGS };
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('let settings = { ...DEFAULT_SETTINGS };')) {
        lines.splice(i, 1);
        console.log('Removed let settings');
        break;
    }
}

fs.writeFileSync('e:/horae/index.js', lines.join('\n'));
