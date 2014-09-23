var util = require('util');
var _ = require('lodash');
var async = require('async');

var models = require(__dirname + '/../models');

module.exports = function (program, init) {
  program
    .command('poll')
    .description('poll resources')
    .option('-f, --feeds', 'parse resources for feed items')
    .option('-t, --timeout <ms>', 'timeout for requests')
    .option('-c, --concurrency <num>', 'number of requests to run concurrently')
    .action(init(cmd));
};

function cmd (options, s) {

  var ct = 0;
  var feed_ct = 0;
  var t_start = Date.now();

  var maybeDone = function () {
    if (queues.fetch.length() > 0) { return; }
    if (queues.poll.length() > 0) { return; }
    if (parseResourceQueue.length() > 0) { return; }
    var duration = Date.now() - t_start;
    s.logger.info('Poll of ' + ct + ' resources finished in ' + duration + 'ms');
    return s.done();
  };

  var parseResourceQueue = async.queue(function (resource, next) {
    var new_ct = 0, exist_ct = 0;
    var url = resource.url;
    models.Feed.parseResource(s.db, resource, {}, function (err, feed) {
      url = feed.xmlurl;
    }, function (err, item, isNew, feed) {
      if (isNew) { new_ct++; }
      else { exist_ct++; }
      if (err) { util.debug('PARSE ' + err); }
    }, function (err) {
      if (err) {
        s.logger.error("UPSERT ERR " + err);
      } else {
        s.logger.debug("Parsed " + new_ct + " / " + exist_ct + " from " + url);
      }
      return next(err, resource);
    });
  });

  parseResourceQueue.drain = maybeDone;

  var queues = models.Resource.pollAll(s.db, {
    concurrency: parseInt(options.concurrency) || 16,
    timeout: parseInt(options.timeout) || 5000
  }, function (err, resource) {
    ct++;
    s.logger.debug(resource.statusCode + ' - ' + resource.lastDuration + 'ms - ' +
      queues.fetch.length() + ' / ' + queues.poll.length() + ' / ' + queues.poll.running() + ' - ' +
      resource.url);
    if (options.parse) {
      parseResourceQueue.push(resource);
    }
  }, maybeDone);

}
