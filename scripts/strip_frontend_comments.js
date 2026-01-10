#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const viewDir = path.join(root, 'views');
const publicDir = path.join(root, 'public');

const cjkPattern = /[\u4e00-\u9fff]/;

function stripHtmlComments(content) {
    let result = content.replace(/<!--(?=[\s\S]*?[\u4e00-\u9fff])[\s\S]*?-->/g, '');
    result = result.replace(/<%#(?=[\s\S]*?[\u4e00-\u9fff])[\s\S]*?%>/g, '');
    return result;
}

function stripCssComments(content) {
    return content.replace(/\/\*(?=[\s\S]*?[\u4e00-\u9fff])[\s\S]*?\*\//g, '');
}

function stripJsComments(content) {
    let result = content.replace(/\/\*(?=[\s\S]*?[\u4e00-\u9fff])[\s\S]*?\*\//g, '');
    result = result.replace(/\/\/[^\n\r]*[\u4e00-\u9fff][^\n\r]*/g, '');
    return result;
}

function processDir(dir, exts, stripFn) {
    if (!fs.existsSync(dir)) {
        return;
    }
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            processDir(fullPath, exts, stripFn);
            continue;
        }
        if (!exts.includes(path.extname(entry.name))) {
            continue;
        }
        const data = fs.readFileSync(fullPath, 'utf8');
        const stripped = stripFn(data);
        if (stripped !== data) {
            fs.writeFileSync(fullPath, stripped, 'utf8');
        }
    }
}

processDir(viewDir, ['.ejs', '.html'], stripHtmlComments);
processDir(publicDir, ['.css'], stripCssComments);
processDir(publicDir, ['.js'], stripJsComments);

console.log('Frontend comments stripped.');
