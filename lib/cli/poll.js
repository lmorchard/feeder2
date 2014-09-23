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

  var feed_ct = 0;
  var t_start = Date.now();

  var maybeDone = function () {
    if (q.fetch.running() > 0) { return; }
    if (q.poll.running() > 0) { return; }
    if (parseResourceQueue.running() > 0) { return; }
    var duration = Date.now() - t_start;
    s.logger.info('Poll of ' + feed_ct + ' resources finished in ' + duration + 'ms');
    return s.done();
  };

  var parseResourceQueue = async.queue(function (resource, next) {
    var url = resource.url;
    var new_ct = 0;
    var exist_ct = 0;
    var err_ct = 0;

    models.Feed.parseResource(s.db, resource, {}, function (err, feed) {
      url = feed.xmlurl;
    }, function (err, item, isNew, feed) {
      if (err) {
        s.logger.error('PARSE ERR ' + resource.url + " " + err);
        err_ct++;
      } else if (isNew) {
        new_ct++;
      } else {
        exist_ct++;
      }
    }, function (err) {
      if (err) {
        s.logger.error("UPSERT ERR " + resource.url + " - " + err);
      } else {
        s.logger.debug("Parsed " + new_ct + " / " + exist_ct + " from " + url);
      }
      return next(err, resource);
    });
  }, 8);

  parseResourceQueue.drain = maybeDone;

  var q = models.Resource.pollAll(s.db, {
    concurrency: parseInt(options.concurrency) || 16,
    timeout: parseInt(options.timeout) || 5000
  }, function (err, resource) {
    feed_ct++;
    s.logger.debug(resource.statusCode + ' - ' + resource.lastDuration + 'ms - ' +
      q.fetch.length() + ' / ' + q.poll.length() + ' / ' + q.poll.running() + ' - ' +
      resource.url);
    if (options.parse) {
      parseResourceQueue.push(resource);
    }
  }, maybeDone);

}
