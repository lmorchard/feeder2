var util = require('util');
var _ = require('lodash');
var async = require('async');

var models = require(__dirname + '/../models');

module.exports = function (program, init) {
  program
    .command('poll')
    .description('poll resources')
    .option('-s, --scan', 'scan resources for feed items')
    .option('-t, --timeout <ms>', 'timeout for requests')
    .option('-c, --concurrency <num>', 'number of requests to run concurrently')
    .action(init(cmd));
};

function cmd (options, s) {
  var ct = 0;
  var t_start = Date.now();

  var queues = models.Resource.pollAll(
    s.db,
    {
      concurrency: parseInt(options.concurrency) || 16,
      timeout: parseInt(options.timeout) || 5000
    },
    function (err, resource) {
      ct++;
      s.logger.debug(resource.statusCode + ' - ' + resource.lastDuration + 'ms - ' +
        queues.fetch.length() + ' / ' + queues.poll.length() + ' / ' + queues.poll.running() + ' - ' +
        resource.url);
    },
    function () {
      var duration = Date.now() - t_start;
      s.logger.info('Poll of ' + ct + ' resources finished in ' + duration + 'ms');
      return s.done();
    }
  );
}
