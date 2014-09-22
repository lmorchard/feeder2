var util = require('util');
var _ = require('lodash');
var async = require('async');

var models = require(__dirname + '/../models');

module.exports = function (program, init) {
  program
    .command('poll')
    .description('poll resources')
    .action(init(cmd));
};

function cmd (options, s) {
  var t_start = Date.now();
  models.Resource.pollAll(s.db, {
    timeout: 30000
  }, function (err, resource) {
    s.logger.debug(resource.lastDuration + 'ms - ' + resource.url);
  }, function () {
    var duration = Date.now() - t_start;
    s.logger.info('Poll finished in ' + duration + 'ms');
    return s.done();
  });
}
