var assert = require('assert');
var async = require('async');
var couchbase = require('couchbase');

describe('updateDdocs', function() {
	before('inserts documents', function(callback) {
		return async.times(4, function(i, callback) {
			return utils.retry(function(callback) {
				return bucket.insert('article-' + i, {
					type: 'article',
					price: i,
				}, {
					expiry: 5
				}, callback);
			}, callback);
		}, callback);
	});

	it('updates ddocs', function(callback) {
		return utils.updateDdocs(callback);
	});
	
	it('queries rows', function(callback) {
		this.timeout(5000);

		var query = couchbase.ViewQuery.from('articles', 'prices')
			.stale(couchbase.ViewQuery.Update.BEFORE);
		
		return utils.retry(function(callback) {
			return bucket.query(query, callback);
		}, function(err, rows) {
			if (err) return callback(err);

			var prices = rows.map(function(row) {
				return row.key;
			});
			assert.deepEqual(prices, [
				0,
				1,
				2,
				3,
			]);

			return callback();
		});
	});
});
