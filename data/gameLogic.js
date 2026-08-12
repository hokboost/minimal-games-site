'use strict';

const crypto = require('crypto');

const SPIN_CHALLENGES = Object.freeze([
    '2加币买吃的',
    'Quiz',
    'Scratch',
    'Slot',
    '10个深蹲',
    '热舞1分钟',
    '10个俯卧撑',
    '转盘次数+2',
    '反方向走3分钟',
    '负重前行',
    '3分钟不能说你我他',
    '20秒吹一瓶可乐',
    '浏览器记录',
    '垃圾清洁工'
]);
const SPIN_WEIGHTS = Object.freeze(SPIN_CHALLENGES.map(() => 1));

class GameLogic {
    static randomInt(min, max) {
        if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max < min) {
            throw new RangeError('Invalid random integer range');
        }
        return crypto.randomInt(min, max + 1);
    }

    static generateToken(length = 32) {
        if (!Number.isSafeInteger(length) || length < 1 || length > 1024) {
            throw new RangeError('Invalid token length');
        }
        return crypto.randomBytes(length).toString('hex');
    }

    static randomFloat() {
        return crypto.randomBytes(4).readUInt32BE(0) / 0x100000000;
    }

    static spin = {
        challenges: SPIN_CHALLENGES,
        weights: SPIN_WEIGHTS,

        getWeightedRandomChallenge() {
            if (this.weights.length !== this.challenges.length
                || this.weights.some((weight) => !Number.isSafeInteger(weight) || weight < 1)) {
                throw new Error('Invalid spin weight configuration');
            }
            const totalWeight = this.weights.reduce((sum, weight) => sum + weight, 0);
            let draw = crypto.randomInt(0, totalWeight);
            for (let index = 0; index < this.weights.length; index += 1) {
                if (draw < this.weights[index]) return index;
                draw -= this.weights[index];
            }
            throw new Error('Invalid spin draw');
        },

        spin() {
            const challengeIndex = this.getWeightedRandomChallenge();
            const segmentAngle = 360 / this.challenges.length;
            const centerAngle = challengeIndex * segmentAngle + segmentAngle / 2;
            const randomOffset = GameLogic.randomInt(-5, 5)
                + (GameLogic.randomFloat() * 0.9 - 0.45);
            return {
                prize: this.challenges[challengeIndex],
                angle: (centerAngle + randomOffset + 360) % 360,
                success: true
            };
        }
    };
}

module.exports = GameLogic;
