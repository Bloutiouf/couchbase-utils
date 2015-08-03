var assert = require('assert');
var async = require('async');
var couchbase = require('couchbase');

var ddoc = {
	views: {
		quantities: {
			map: function(doc) {
				if (doc.type === 'stock') {
					emit(doc.quantity, doc.product);
				}
			}.toString(),
		},
	},
};

describe('provide', function() {
	before('inserts documents', function(callback) {
		return async.times(15, function(i, callback) {
			return utils.retry(function(callback) {
				return bucket.insert('stock-' + i, {
					type: 'stock',
					product: 'product-' + i,
					quantity: i,
				}, {
					expiry: 5,
				}, callback);
			}, callback);
		}, callback);
	});

	before('inserts ddoc', function(callback) {
		return utils.retry(function(callback) {
			return bucket.manager().insertDesignDocument('stocks', ddoc, callback);
		}, callback);
	});
	
	it('provides rows', function(callback) {
		this.timeout(20000);

		var query = couchbase.ViewQuery.from('stocks', 'quantities')
			.stale(couchbase.ViewQuery.Update.BEFORE)
			.limit(3);
		
		var quantity = 0;
		var productIds = [];
		
		return utils.provide(query, function(row, callback) {
			quantity += row.key;
			productIds.push(row.value);
			return callback(null, quantity < 40);
		}, function(err) {
			if (err) return callback(err);

			assert.strictEqual(quantity, 45);
			assert.deepEqual(productIds, [
				'product-0',
				'product-1',
				'product-2',
				'product-3',
				'product-4',
				'product-5',
				'product-6',
				'product-7',
				'product-8',
				'product-9',
			]);

			return callback();
		});
	});
});
