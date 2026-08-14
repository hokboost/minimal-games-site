'use strict';

module.exports = {
    ...require('./registry'),
    ...require('./blindbox'),
    economics: require('./economics'),
    presentation: require('./presentation'),
    random: require('./random'),
    records: require('./records')
};
