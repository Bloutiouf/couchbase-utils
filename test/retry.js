var async = require('async');

describe('retry', function() {
	it('inserts a document', function(callback) {
		return utils.retry(function(callback) {
			return bucket.insert('banana', {
				type: 'banana',
				price: 1,
			}, {
				expiry: 5,
			}, callback);
		}, callback);
	});

	it('updates the document', function(callback) {
		return utils.retry(function(callback) {
			return bucket.get('banana', function(err, data) {
				if (err) return callback(err);
				data.value.price = 2;
				return bucket.replace('banana', data.value, {
					cas: data.cas,
					expiry: 5,
				}, callback);
			});
		}, callback);
	});

	it('simultaneously updates the document', function(callback) {
		return async.times(100, function(i, callback) {
			return utils.retry(function(callback) {
				return bucket.get('banana', function(err, data) {
					if (err) return callback(err);
					data.value.price = 2;
					return bucket.replace('banana', data.value, {
						cas: data.cas,
						expiry: 5,
					}, callback);
				});
			}, callback);
		}, callback);
	});
});
