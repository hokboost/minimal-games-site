'use strict';

const { randomInt } = require('node:crypto');
const PILOT_USER_ID = 147; // 已核对数据库：一个乌龟酱。不可用显示名称或客户端参数授权。
const PRIZES = Object.freeze([1000, 2000, 3000, 5000, 10000, 15000, 20000, 30000]);
const SONGS = Object.freeze([
    { id: 'bad-wings', title: '坏翅膀', aliases: ['壞翅膀'], artist: '周菲戈', credit: '翻唱' },
    { id: 'only-us', title: '唯独我们', aliases: ['唯獨我們'], artist: '尧顺宇', credit: '原唱' },
    { id: 'passing', title: '暂时的记号', aliases: ['暫時的記號'], artist: '林俊杰', credit: '原唱' },
    { id: 'light', title: '我曾遇到一束光', aliases: [], artist: '叶斯淳', credit: '原唱' },
    { id: 'roses', title: '九百九十九朵玫瑰', aliases: ['999朵玫瑰'], artist: '邰正宵', credit: '原唱' },
    { id: 'nothing', title: '是否我真的一无所有', aliases: ['是否我真的一無所有'], artist: '王杰', credit: '原唱' },
    { id: 'love-you', title: '他一定很爱你', aliases: ['他一定很愛你'], artist: '阿杜', credit: '原唱' },
    { id: 'awakening', title: '梦醒时分', aliases: ['夢醒時分'], artist: '陈淑桦', credit: '原唱' },
    { id: 'past-love', title: '当爱已成往事', aliases: ['當愛已成往事'], artist: '林忆莲、李宗盛', credit: '原唱' }
].map(song => Object.freeze({ ...song, aliases: Object.freeze(song.aliases) })));

function canPlayDoorbell(user) {
    return Boolean(user && user.authorized === true && user.deactivated !== true
        && user.account_locked !== true && (user.is_admin === true || Number(user.id) === PILOT_USER_ID));
}

function selectSongs(rng = randomInt) {
    const rest = SONGS.slice(3).map(song => song.id);
    for (let i = rest.length - 1; i > 0; i--) {
        const j = rng(i + 1);
        [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    return [...SONGS.slice(0, 3).map(song => song.id), ...rest.slice(0, 5)];
}

function normalizeAnswer(text) {
    return typeof text === 'string' ? text.normalize('NFKC').replace(/[\s\p{P}]/gu, '').toLowerCase() : '';
}

function isCorrect(song, answer) {
    const normalized = normalizeAnswer(answer);
    return [song.title, ...song.aliases].some(title => normalizeAnswer(title) === normalized);
}

function songById(id) {
    const song = SONGS.find(item => item.id === id);
    if (!song) throw new Error('Invalid stored doorbell song');
    return song;
}

function prize(completed) { return completed === 0 ? 0 : PRIZES[completed - 1]; }

module.exports = { PILOT_USER_ID, PRIZES, SONGS, canPlayDoorbell, selectSongs, normalizeAnswer, isCorrect, songById, prize };
