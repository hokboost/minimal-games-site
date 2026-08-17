'use strict';

const b = (zh, en) => ({ zh, en });
const option = (...args) => {
    const value = typeof args[0] === 'object' ? args[0] : {
        labelZh: args[0],
        labelEn: args[1],
        outcomeZh: args[2],
        outcomeEn: args[3],
        resultZh: args[4],
        resultEn: args[5],
        axis: args[6],
        route: args[7]
    };
    const { labelZh, labelEn, outcomeZh, outcomeEn, resultZh, resultEn, axis, route } = value;
    return {
    label: b(labelZh, labelEn),
    outcome: b(outcomeZh, outcomeEn),
    result: b(resultZh, resultEn),
    axis,
    route
    };
};
const scene = (...args) => {
    const value = typeof args[0] === 'object' ? args[0] : {
        speaker: args[0],
        introZh: args[1],
        introEn: args[2],
        promptZh: args[3],
        promptEn: args[4],
        options: args[5]
    };
    return {
        speaker: value.speaker,
        text: b(value.introZh, value.introEn),
        prompt: b(value.promptZh, value.promptEn),
        options: value.options
    };
};
const episode = (slug, titleZh, titleEn, character, cameo, scenes, archive, memory, owner = null) => ({
    slug,
    title: b(titleZh, titleEn),
    character,
    cameo,
    scenes,
    archive,
    memory,
    owner
});

module.exports = { b, episode, option, scene };
