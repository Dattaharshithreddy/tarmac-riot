// Rebuild the web game and copy it into the app.
require('./build.js');
const fs = require('fs'), path = require('path');
const h = fs.readFileSync(path.join(__dirname, 'dist', 'index.html'), 'utf8');
fs.writeFileSync(path.join(__dirname, '..', 'game-html.ts'), '// Generated from the Tarmac Riot web build. Do not edit by hand.\nconst GAME_HTML: string = ' + JSON.stringify(h) + ';\nexport default GAME_HTML;\n');
console.log('updated game-html.ts');
