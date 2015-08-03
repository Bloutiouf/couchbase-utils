var async = require('async');
var qs = require("querystring")
module.exports = function(options, retry) {
	return function(query, params, rowCallback, callback) {
		var cache;
		var whilst = true;

		if (typeof params === 'function') {
			callback = rowCallback;
			rowCallback = params;
			params = null;
		}
		
		return async.doWhilst(function(callback) {
			if (!cache || !cache.length) {
				return retry(function(callback) {
					return options.bucket.query(query, params, callback);
				}, function(err, rows) {
					if (err) return callback(err);

					if (rows.length)
						cache = rows;
					else
						whilst = false;

					return callback();
				});
			}

			var row = cache.shift();
			return rowCallback(row, function(err, _whilst) {
				if (err) return callback(err);

				whilst = _whilst;

				if (whilst && !cache.length) {
					query.range(row.key)
						.id_range(row.id)
						.skip(1);
				}

				return callback();
			});
		}, function() {
			return whilst;
		}, callback);
	};
};
