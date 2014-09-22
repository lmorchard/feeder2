var crypto = require('crypto');
var util = require('util');
var stream = require('stream');
var events = require('events');
var _ = require('lodash');
var async = require('async');
var mongo = require('mongodb');
var FeedParser = require('feedparser');

var requestOrig = require('request');
var http = require('http');
var request = requestOrig.defaults({
  agent: new http.Agent({
    maxSockets: 8
  })
});

var models = module.exports = {};

models.db = function (config) {
  config = _.defaults(config || {}, {
    host: 'localhost',
    port: 27017,
    name: 'feeder',
    serverOpts: { auto_reconnect: true },
    dbOpts: { w: 0 }
  });
  return new mongo.Db(
    config.name,
    new mongo.Server(config.host, config.port, config.serverOpts),
    config.dbOpts
  );
}

function md5 (/*...*/) {
  var hash = crypto.createHash('md5');
  for (var i=0; i<arguments.length; i++) {
    hash.update('' + arguments[i]);
  }
  return hash.digest('hex');
}

function baseGetOne (db, query, next) {
  var cls = this, query;
  if ('string' == typeof id) {
    query = {_id: query};
  }
  db.collection(cls.collection, function (err, coll) {
    coll.findOne(query, function (err, doc) {
      if (err || !doc) {
        return next(err, null);
      } else {
        return next(null, new cls(doc));
      }
    });
  });
}

function baseInit (cls, attrs) {
  attrs = _.defaults(attrs || {}, cls.defaults);
  for (var n in attrs) {
    this[n] = attrs[n];
  }
  if (!this._id) { this._id = cls.id(this); }
}

function baseSave (cls, db, next) {
  var $this = this;

  this.updated = Date.now();

  var opts = {upsert: true, fullResult: true, w: 1};
  db.collection(cls.collection, function (err, coll) {
    coll.update({_id: $this._id}, $this, opts, next);
  });

  return this;
}

function baseUpdate (cls, db, attrs, next) {
  var $this = this;

  attrs.updated = Date.now();

  var opts = {upsert: true, w: 1, new: true};
  db.collection(cls.collection, function (err, coll) {
    coll.findAndModify({_id: $this._id}, {$set: attrs}, opts, next);
  });

  return this;
}

models.Resource = function (attrs) {
  baseInit.call(this, models.Resource, attrs);
};

_.extend(models.Resource, {

  collection: 'resources',

  defaults: {
    disabled: false,
    statusCode: '',
    headers: {},
    lastError: '',
    encoding: 'utf8',
    maxAge: 3600000,
    timeout: 10000,
    lastDuration: 0,
    lastValidated: 0
  },

  id: function (obj) { return md5(obj.url); },

  getOne: function (db, query, next) {
    return baseGetOne.call(this, db, query, next);
  },

  upsertQueue: function (db) {
    return async.queue(function (task, next) {
      db.collection(models.Resource.collection, function (err, coll) {
        var doc = new models.Resource(task);
        var opts = {upsert: true, fullResult: true, w: 1};
        coll.update({_id: doc._id}, doc, opts, function (err, result) {
          next(err, doc)
        });
      });
    });
  },

  pollAll: function (db, options, each, done) {
    options = _.defaults(options || {}, {
      concurrency: 16
    });
    queue = async.queue(function (resource, next) {
      resource.poll(db, options, next);
    }, options.concurrency);
    queue.drain = done;
    db.collection(models.Resource.collection, function (err, coll) {
      coll.find().each(function (err, doc) {
        if (doc) {
          queue.push(new models.Resource(doc), each);
        }
      });
    });
    return queue;
  }

});

_.extend(models.Resource.prototype, {

  save: function (db, next) {
    return baseSave.call(this, models.Resource, db, next);
  },

  update: function (db, attrs, next) {
    return baseUpdate.update(this, models.Resource, db, attrs, next);
  },

  poll: function (db, options, next) {
    options = options || { };
    var $this = this;

    var t_now = Date.now();

    // Common exit point
    var _next = _.once(function (err, r) {
      next(err, $this);
    });

    // Save resource exit point
    var _save = function (err) {
      $this.lastValidated = t_now;
      $this.lastDuration = Date.now() - t_now;
      $this.save(db, function (err, coll) {
        _next(err);
      });
      return $this;
    };

    // Bail out if this resource is disabled.
    if ($this.disabled) {
      setImmediate(_next);
      return $this;
    }

    // Skip poll if stored content is newer than max_age.
    var age = t_now - $this.lastValidated;
    var max_age = ('max_age' in options) ?
      options.max_age : $this.maxAge;
    if (age < max_age) {
      setImmediate(_next);
      return $this;
    }

    // Request options
    var opts = {
      method: 'GET',
      url: $this.url,
      timeout: options.timeout || $this.timeout,
      encoding: null,
      jar: false,
      gzip: true,
      headers: {
        'accept-encoding': 'gzip'
      },
      // TODO: Track 3xx redirects, update resource URL on 301
      // followRedirect: false
    };

    // Conditional GET support...
    var prev_headers = $this.headers;
    if (prev_headers.etag) {
      opts.headers['If-None-Match'] = prev_headers.etag;
    }
    if (prev_headers['last-modified']) {
      opts.headers['If-Modified-Since'] = prev_headers['last-modified'];
    }

    var req = request(opts, function (err, resp, body) {
      if (err) {
        if ('ETIMEDOUT' == err.code || 'ESOCKETTIMEDOUT' == err.code) {
          $this.statusCode = 408;
          $this.lastError = err.code;
        } else {
          $this.statusCode = 499;
          $this.lastError = ''+err;
        }
        return _save(err);
      }
      $this.statusCode = resp.statusCode;
      $this.headers = resp.headers;
      if (body) { $this.body = body.toString($this.encoding); }
      return _save();
    });

    return this;
  }

});

models.Feed = function (attrs) {
  baseInit.call(this, models.Feed, attrs);
};

_.extend(models.Feed, {

  collection: 'feeds',

  defaults: {
  },

  id: function (obj) {
    return md5(obj.xmlurl);
  },

  getOne: function (db, query, next) {
    return baseGetOne.call(this, db, query, next);
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

_.extend(models.Feed.prototype, {
  save: function (db, next) {
    return baseSave.call(this, models.Feed, db, next);
  },
  update: function (db, attrs, next) {
    return baseUpdate.update(this, models.Feed, db, attrs, next);
  }
});

models.Item = function (attrs) {
  baseInit.call(this, models.Item, attrs);
};

_.extend(models.Item, {
  collection: 'items',
  defaults: {
  },
  id: function (obj) {
    return md5(obj.link, obj.guid, obj.title, obj.description);
  },
  getOne: function (db, query, next) {
    return baseGetOne.call(this, db, query, next);
  }
});

_.extend(models.Item.prototype, {
  save: function (db, next) {
    return baseSave.call(this, models.Item, db, next);
  },
  update: function (db, attrs, next) {
    return baseUpdate.update(this, models.Item, db, attrs, next);
  }
});
