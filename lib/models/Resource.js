var _ = require('lodash');
var async = require('async');
var FeedParser = require('feedparser');

var requestOrig = require('request');
var http = require('http');
var request = requestOrig.defaults({
  agent: new http.Agent({
    maxSockets: 8
  })
});

module.exports = function (models, baseClass, baseProto) {

  var Resource = function (attrs) {
    baseClass.init.call(this, Resource, attrs);
  };

  _.extend(Resource, baseClass, {

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

    upsertQueue: function (db) {
      return async.queue(function (task, next) {
        db.collection(Resource.collection, function (err, coll) {
          var doc = new Resource(task);
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
      db.collection(Resource.collection, function (err, coll) {
        coll.find().each(function (err, doc) {
          if (doc) {
            queue.push(new Resource(doc), each);
          }
        });
      });
      return queue;
    }

  });

  _.extend(Resource.prototype, baseProto(Resource), {

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

  return Resource;
};