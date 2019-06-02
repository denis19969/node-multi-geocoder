var vow = require('vow'),
  inherit = require('inherit'),
  Queue = require('vow-queue'),
  providers = require('./providers');

module.exports = inherit(/** @lends Geocoder.prototype */ {
  __constructor: function (options) {
    this._options = options || {};
    this._queue = null;
    this.setProvider(this._options.provider || 'yandex-cache');
  },
  getProvider: function () {
    return this._provider;
  },
  setProvider: function (key) {
    this._provider = new providers[key](this._options);

    return this;
  },
  geocode: function (points, options) {
    var provider = this._provider,
      queue = this._queue = new Queue({weightLimit: 10}),
      tasks = [],
      features = [],
      errors = [],
      valid = [],
      enqueue = function (task) {
        tasks.push(queue.enqueue(task, {priority: 1, weight: 1}));
      },
      getProgress = function (num) {
        return Math.round(num * 100 / tasks.length);
      };
    if (options && options.unique) {
      points.forEach(el => {
        const duplicate = valid.find(point => (point && point.address) === (el && el.address));
        if (duplicate) {
          el.reason = `A point with this address already exists (${duplicate.name || ''})`;
        }
        valid.push(el);
      })
    } else {
      valid = points;
    }
    valid.forEach(function (point) {
      enqueue(provider.geocode.bind(provider, point, options));
    });
    queue.start();

    return vow.allResolved(tasks)
      .then(function (results) {

        results.forEach(function (promise, index) {
          var value = promise.valueOf();

          if (promise.isFulfilled()) {
            features.push({request: points[index], ...value, index});
          } else {
            errors.push({
              request: points[index],
              index: index,
              reason: value instanceof Error ? value.message : value
            });
          }
        });

        return {
          result: {
            "type": "FeatureCollection",
            "features": features
          },
          errors: errors
        };
      })
      .progress(function (message) {
        var stats = queue.getStats();

        return {
          message: message,
          processed: getProgress(stats.processedTasksCount),
          processing: getProgress(stats.processingTasksCount)
        };
      });
  },
  abort: function () {
    this._queue.stop();

    return this;
  }
});
