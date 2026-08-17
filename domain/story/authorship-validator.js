'use strict';

class StoryAuthorshipError extends Error {
    constructor(message) {
        super(message);
        this.name = 'StoryAuthorshipError';
        this.code = 'STORY_AUTHORSHIP_INVALID';
    }
}

function visiblePairs(content) {
    const pairs = [];
    const add = (value, label) => {
        if (value?.zh && value?.en) pairs.push({ label, zh: value.zh, en: value.en });
    };
    add(content.title, `${content.slug}.title`);
    for (const episode of content.episodes) add(episode.title, `${content.slug}.${episode.slug}.title`);
    for (const node of content.nodes) {
        add(node.text, `${content.slug}.${node.id}.text`);
        for (const option of node.options || []) {
            add(option.label, `${content.slug}.${node.id}.${option.id}.label`);
            add(option.outcome, `${content.slug}.${node.id}.${option.id}.outcome`);
        }
        for (const option of node.answerOptions || []) add(option.label, `${content.slug}.${node.id}.${option.id}.answer`);
    }
    for (const [key, memory] of Object.entries(content.memories || {})) {
        add(memory.title, `${content.slug}.${key}.title`);
        add(memory.body, `${content.slug}.${key}.body`);
    }
    for (const [key, message] of Object.entries(content.messages || {})) {
        add(message.title, `${content.slug}.${key}.title`);
        add(message.body, `${content.slug}.${key}.body`);
    }
    return pairs;
}

function normalized(value) {
    return value.normalize('NFKC').toLocaleLowerCase('en-US')
        .replace(/[0-9]+/g, '#')
        .replace(/[\p{P}\p{S}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function repeatedNgrams(pairs) {
    const seen = new Map();
    const record = (key, label) => {
        const labels = seen.get(key) || new Set();
        labels.add(label);
        seen.set(key, labels);
    };
    for (const pair of pairs) {
        const words = normalized(pair.en).split(' ').filter(Boolean);
        for (let index = 0; index + 5 < words.length; index += 1) {
            record(`en:${words.slice(index, index + 6).join(' ')}`, pair.label);
        }
        const han = normalized(pair.zh).replace(/\s/g, '');
        for (let index = 0; index + 11 < han.length; index += 1) {
            record(`zh:${han.slice(index, index + 12)}`, pair.label);
        }
    }
    return [...seen.entries()].filter(([, labels]) => labels.size > 8);
}

function isOwnerMessageReference(left, right) {
    const message = left.endsWith('.owner-note.body') ? left : right.endsWith('.owner-note.body') ? right : null;
    const node = message === left ? right : left;
    if (!message) return false;
    return node === `${message.slice(0, -'.owner-note.body'.length)}.owner.text`;
}

function validateStoryAuthorship(contents) {
    const pairs = contents.flatMap(visiblePairs);
    const exact = new Map();
    for (const pair of pairs) for (const language of ['zh', 'en']) {
        const key = `${language}:${normalized(pair[language])}`;
        if (exact.has(key)) {
            const prior = exact.get(key);
            if (!isOwnerMessageReference(pair.label, prior)) {
                throw new StoryAuthorshipError(`Repeated visible text at ${pair.label} and ${prior}`);
            }
        }
        exact.set(key, pair.label);
    }
    const repeated = repeatedNgrams(pairs);
    if (repeated.length) {
        const [ngram, labels] = repeated[0];
        throw new StoryAuthorshipError(`Repeated sentence skeleton ${ngram} across ${labels.size} fields`);
    }
    return Object.freeze({ bilingualBeats: pairs.length, uniqueTexts: exact.size });
}

function validateFullStoryCatalog(contents) {
    if (!Array.isArray(contents) || contents.length !== 5) throw new StoryAuthorshipError('Story catalog requires five seasons');
    const authorship = validateStoryAuthorship(contents);
    const counts = contents.reduce((total, content) => {
        total.episodes += content.episodes.length;
        total.nodes += content.nodes.length;
        total.choices += content.nodes.filter((node) => node.type === 'choice').reduce((sum, node) => sum + node.options.length, 0);
        total.endings += content.nodes.filter((node) => node.type === 'season_ending').length;
        total.memories += Object.keys(content.memories || {}).length;
        total.ownerInterventions += content.nodes.filter((node) => node.type === 'owner_intervention').length;
        return total;
    }, { episodes: 0, nodes: 0, choices: 0, endings: 0, memories: 0, ownerInterventions: 0 });
    const minimums = { episodes: 60, nodes: 720, choices: 600, endings: 25, memories: 50, ownerInterventions: 30 };
    for (const [key, minimum] of Object.entries(minimums)) {
        if (counts[key] < minimum) throw new StoryAuthorshipError(`Story catalog ${key} count is below ${minimum}`);
    }
    if (authorship.bilingualBeats < 1200) throw new StoryAuthorshipError('Story catalog bilingual beat count is below 1200');
    return Object.freeze({ ...counts, bilingualBeats: authorship.bilingualBeats, uniqueTexts: authorship.uniqueTexts });
}

module.exports = { StoryAuthorshipError, normalized, repeatedNgrams, validateFullStoryCatalog, validateStoryAuthorship, visiblePairs };
