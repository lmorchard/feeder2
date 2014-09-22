var _ = require('lodash');
var async = require('async');
var FeedParser = require('feedparser');
var stream = require('stream');

module.exports = function (models, baseClass, baseProto) {

  var Feed = function () {
    this.init.apply(this, arguments);
  };

  _.extend(Feed, baseClass, {

    collection: 'feeds',

    defaults: {
    },

    id: function (obj) {
      return models.md5(obj.xmlurl);
    },

    upsertResource: function (db, resource, options, cbFeed, cbItem, cbDone) {
      if (resource.statusCode >= 400) { return cbDone(); }

      var s = new stream.Readable();
      s._read = function noop() {};
      s.push(resource.body);
      s.push(null);

      var parser = new FeedParser({addmeta: false});

      s.pipe(parser).on('readable', function () {

        var $this = this;
        $this.meta.resourceId = resource._id;
        $this.meta.xmlurl = resource.url;

        var feed = new models.Feed($this.meta);
        feed.save(db, function (err, result) {
          cbFeed(err, feed);

          var data, tasks = [];
          while (data = $this.read()) {
            data.resourceId = resource._id;
            data.feedId = feed._id;
            tasks.push(data);
          }

          async.each(tasks, function (task, next) {
            var item = new models.Item(task);
            item.save(db, function (err, result) {
              cbItem(err, item, feed);
              next();
            });
          }, cbDone);

        });

      }).on('error', cbDone);
    }

  });

  _.extend(Feed.prototype, baseProto(Feed), {
  });

  return Feed;
};
