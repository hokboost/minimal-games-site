#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const root = path.join(__dirname, '..');
const jsDir = path.join(root, 'public', 'js');

function obfuscateFile(filePath) {
    const source = fs.readFileSync(filePath, 'utf8');
    const result = JavaScriptObfuscator.obfuscate(source, {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.75,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.35,
        stringArray: true,
        stringArrayThreshold: 0.75,
        splitStrings: true,
        splitStringsChunkLength: 8,
        renameGlobals: false,
        simplify: true,
        unicodeEscapeSequence: false
    });
    fs.writeFileSync(filePath, result.getObfuscatedCode(), 'utf8');
}

if (!fs.existsSync(jsDir)) {
    console.error('public/js not found.');
    process.exit(1);
}

const files = fs.readdirSync(jsDir).filter((name) => name.endsWith('.js'));
files.forEach((file) => obfuscateFile(path.join(jsDir, file)));

console.log(`Obfuscated ${files.length} files.`);
