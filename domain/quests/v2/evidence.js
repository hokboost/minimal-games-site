'use strict';

const crypto = require('node:crypto');
const { normalizePng } = require('../../../lib/png-normalizer');

class QuestEvidenceError extends Error {
    constructor(message, code = 'QUEST_EVIDENCE_INVALID') {
        super(message);
        this.name = 'QuestEvidenceError';
        this.code = code;
    }
}

function plain(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function boundedText(value, maximum) {
    const text = typeof value === 'string' ? value.normalize('NFKC').trim() : '';
    if (!text || text.length > maximum || /[\u0000-\u001f\u007f]/u.test(text)) {
        throw new QuestEvidenceError('Evidence text is invalid');
    }
    return text;
}

async function validateEvidence(raw, { expectedKind, normalize = normalizePng } = {}) {
    if (!plain(raw) || !['text', 'checklist', 'png'].includes(expectedKind)) {
        throw new QuestEvidenceError('Unsupported evidence kind');
    }
    if (expectedKind === 'text') {
        return Object.freeze({ kind: 'text', content: { text: boundedText(raw.text, 2000) }, media: null });
    }
    if (expectedKind === 'checklist') {
        if (!Array.isArray(raw.items) || raw.items.length < 1 || raw.items.length > 20) {
            throw new QuestEvidenceError('Evidence checklist is invalid');
        }
        const items = raw.items.map((item) => {
            if (!plain(item) || typeof item.checked !== 'boolean') throw new QuestEvidenceError('Evidence checklist item is invalid');
            return Object.freeze({ label: boundedText(item.label, 120), checked: item.checked });
        });
        if (!items.every((item) => item.checked)) throw new QuestEvidenceError('Every checklist item must be confirmed');
        return Object.freeze({ kind: 'checklist', content: { items }, media: null });
    }
    const prefix = 'data:image/png;base64,';
    if (typeof raw.imageData !== 'string' || !raw.imageData.startsWith(prefix)) {
        throw new QuestEvidenceError('Only PNG evidence is supported');
    }
    const encoded = raw.imageData.slice(prefix.length);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new QuestEvidenceError('PNG evidence encoding is invalid');
    const input = Buffer.from(encoded, 'base64');
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (input.length < 24 || input.length > 768 * 1024 || !input.subarray(0, 8).equals(signature)) {
        throw new QuestEvidenceError('PNG evidence exceeds bounds');
    }
    const width = input.readUInt32BE(16);
    const height = input.readUInt32BE(20);
    if (width < 1 || height < 1 || width > 1600 || height > 1600 || width * height > 2_000_000) {
        throw new QuestEvidenceError('PNG evidence dimensions are invalid');
    }
    let normalized;
    try {
        normalized = await normalize(input, { expectedWidth: width, expectedHeight: height, maxOutputBytes: 768 * 1024 });
    } catch (error) {
        if (error.code === 'PNG_QUEUE_FULL') throw new QuestEvidenceError('PNG evidence processing is busy', 'QUEST_EVIDENCE_BUSY');
        throw new QuestEvidenceError('PNG evidence cannot be decoded');
    }
    return Object.freeze({
        kind: 'png',
        content: {},
        media: Object.freeze({
            buffer: normalized.buffer,
            mediaType: 'image/png',
            byteCount: normalized.buffer.length,
            width: normalized.width,
            height: normalized.height,
            sha256: crypto.createHash('sha256').update(normalized.buffer).digest('hex')
        })
    });
}

module.exports = { QuestEvidenceError, validateEvidence };
