var util = require('util');
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

    parseResource: function (db, resource, options, cbFeed, cbItem, cbDone) {
      if (resource.statusCode >= 400) { return cbDone(); }

      var s = new stream.Readable();
      s._read = function noop() {};
      s.push(resource.body);
      s.push(null);

      var onceDone = _.once(cbDone);

      s.pipe(new FeedParser({addmeta: false}))
      .on('error', onceDone)
      .on('readable', function () {
        var $this = this;
        $this.meta.resourceId = resource._id;
        $this.meta.xmlurl = resource.url;

        var feed = new models.Feed($this.meta);
        feed.save(db, function (err, result) {

          cbFeed(err, feed);
          if (err) { return onceDone(); }

          var data, tasks = [];
          while (data = $this.read()) {
            data.resourceId = resource._id;
            data.feedId = feed._id;
            tasks.push(data);
          }
          if (!tasks.length) { return onceDone(); }

          async.each(tasks, function (task, next) {
            var id = models.Item.id(task);
            models.Item.getOne(db, id, function (err, existing) {
              if (existing) {
                cbItem(err, existing, false, feed);
                next();
              } else {
                var item = new models.Item(task);
                item.save(db, function (err, result) {
                  cbItem(err, item, true, feed);
                  next();
                });
              }
            });
          }, onceDone);

        });
      });

    }

  });

  _.extend(Feed.prototype, baseProto(Feed), {
  });

  return Feed;
};
