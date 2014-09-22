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

        if (err) {
          s.logger.error("DB error " + err);
          return s.done();
        }

        if (!item) {
          s.logger.info("Done. Feeds = " + feed_ct + "; Items = " + item_ct);
          return s.done();
        }

        var r = new models.Resource(item);
        models.Feed.upsertResource(s.db, r, {}, function (err, feed) {
          if (!err) {
            feed_ct++;
            s.logger.info("FEED " + feed_ct + " " + feed.xmlurl);
          }
        }, function (err, item, feed) {
          if (!err) {
            item_ct++;
            // s.logger.debug("ITEM " + item_ct + " " + item.link);
          }
        }, function (err) {
          if (err) {
            s.logger.error("UPSERT ERR " + err);
          }
          return next(err, cursor);
        });

      });
    };

    coll.find(query, opts, next);

  });
}
