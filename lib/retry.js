var async = require('async');
var couchbase = require('couchbase');

var errors = couchbase.errors;

module.exports = function(options) {
	var timeout = options.timeout || 10;
	var timeoutSeconds = Math.floor(timeout);
	var timeoutArray = [timeoutSeconds, timeout - timeoutSeconds];

	var maxDelay = (options.maxDelay || 1) * 1000;
	
	return function(tryCallback, callback) {
		var time = process.hrtime();
		var delay = 1;
		var results;
		
		return async.doUntil(function(callback) {
			return tryCallback(function(err) {
				if (err && typeof err === 'object') {
					var diff = process.hrtime(time);
					if (diff[0] >= timeoutArray[0] && diff[1] >= timeoutArray[1]) {
						return callback(err);
					}

					if (err.code === errors.keyAlreadyExists) { // CAS mismatch
						return callback();
					}

					if (err.code === errors.cLibOutOfMemory ||
						err.code === errors.temporaryError ||
						err.code === errors.clientOutOfMemory ||
						err.code === errors.clientTemporaryError)
					{
						setTimeout(callback, delay);
						delay = Math.min(maxDelay, delay * (1.5 + Math.random()));
						return;
					}

					return callback(err);
				}

				results = Array.prototype.slice.call(arguments);
				return callback();
			});
		}, function() {
			return results;
		}, function(err) {
			if (err) return callback(err);
			return callback.apply(this, results);
		});
	};
};
