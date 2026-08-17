'use strict';

const seasonOne = require('./season-one');
const seasonTwo = require('./season-2');
const seasonThree = require('./season-3');
const seasonFour = require('./season-4');
const seasonFive = require('./season-5');
const { validateFullStoryCatalog } = require('../../../domain/story/authorship-validator');

const seasons = Object.freeze([
    seasonOne,
    seasonTwo,
    seasonThree,
    seasonFour,
    seasonFive
]);

const bySlug = new Map(seasons.map((season) => [season.slug, season]));
const counts = validateFullStoryCatalog(seasons);

function requireSeason(slug) {
    const season = bySlug.get(slug);
    if (!season) {
        const error = new Error('Unknown story season');
        error.code = 'STORY_SEASON_NOT_FOUND';
        throw error;
    }
    return season;
}

module.exports = { bySlug, counts, requireSeason, seasons };
