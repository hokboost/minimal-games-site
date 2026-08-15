'use strict';

module.exports = {
    ...require('./registry'),
    ...require('./blindbox'),
    doudizhu: require('./doudizhu'),
    economics: require('./economics'),
    presentation: require('./presentation'),
    random: require('./random'),
    records: require('./records')
};
