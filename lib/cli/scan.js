var util = require('util');
var _ = require('lodash');
var async = require('async');

var models = require(__dirname + '/../models');

module.exports = function (program, init) {
  program
    .command('scan')
    .description('scan feeds and items from resources')
    .action(init(cmd));
};

function cmd (options, s) {
  s.db.collection(models.Resource.collection, function (err, coll) {

    var query = {};
    var opts = {};
    var feed_ct = 0, item_ct = 0;

    var next = function (err, cursor) {

      cursor.nextObject(function (err, item) {

        if (!item) {
          s.logger.info("Done. Feeds = " + feed_ct + "; Items = " + item_ct);
          return s.done();
        }

        var r = new models.Resource(item);
        // s.logger.info(r.url);

        models.Feed.upsertResource(s.db, r, {}, function (err, feed) {
          if (err) { s.logger.error('FEED ERR ' + err); }
          else {
            feed_ct++;
            //s.logger.debug('FEED', feed.xmlurl);
          }
        }, function (err, item, feed) {
          if (err) { s.logger.error('ITEM ERR ' + err); }
          else {
            item_ct++;
            //s.logger.debug('ITEM', item.link);
          }
        }, function (err) {
          return next(err, cursor);
        });

      });
    };

    coll.find(query, opts, next);

  });
}
