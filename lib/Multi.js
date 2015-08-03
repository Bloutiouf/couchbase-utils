var async = require('async');

module.exports = function(options, retry) {
	function Multi() {
		this.docIds = {};
		this.handlers = [];
	}

	Multi.prototype.execute = function(callback) {
		var self = this;

		if (!self.handlers.length)
			return callback();

		var docIds = Object.keys(this.docIds);

		return retry(function(callback) {
			return options.bucket.getMulti(docIds, function(err, documents) {
				if (err && typeof err !== 'number') return callback(err);

				return async.each(self.handlers, function(handler, callback) {
					var data = documents[handler[0]];
					return handler[1](data, callback);
				}, callback);
			});
		}, callback);
	};

	Multi.prototype.register = function(docId, handler) {
		this.docIds[docId] = true;
		this.handlers.push([docId, handler]);
	};

	return Multi;
};
