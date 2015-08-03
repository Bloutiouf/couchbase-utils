var assert = require('assert');
var async = require('async');

describe('Multi', function() {
	before('inserts documents', function(callback) {
		return async.times(10, function(i, callback) {
			return utils.retry(function(callback) {
				return bucket.insert('tomato-' + i, {
					type: 'tomato',
					price: i,
				}, {
					expiry: 5,
				}, callback);
			}, callback);
		}, callback);
	});

	it('gets no documents', function(callback) {
		var multi = new utils.Multi();
		return multi.execute(callback);
	});

	it('gets documents', function(callback) {
		var multi = new utils.Multi();
		var count = 0;

		function registerTomato(i) {
			return multi.register('tomato-' + i, function(data, callback) {
				if (data.err) return callback(data.err);
				if (data.value.price >= 5) ++count;
				return callback();
			});
		}

		for (var i = 0; i < 10; ++i)
			registerTomato(i);

		return multi.execute(function(err) {
			if (err) return callback(err);
			assert.deepEqual(count, 5);
			return callback();
		});
	});

	it('updates documents', function(callback) {
		var multi = new utils.Multi();

		function registerTomato(i) {
			return multi.register('tomato-' + i, function(data, callback) {
				if (data.err) return callback(data.err);
				++data.value.price;
				return bucket.replace('tomato-' + i, data.value, {
					cas: data.cas,
					expiry: 5,
				}, callback);
			});
		}

		for (var i = 0; i < 10; ++i)
			registerTomato(i);

		return multi.execute(callback);
	});

	it('simultaneously updates the same document', function(callback) {
		var multi = new utils.Multi();

		function registerTomatoField(i) {
			return multi.register('tomato-0', function(data, callback) {
				if (data.err) return callback(data.err);
				if (data.value['field' + i]) return callback();
				data.value['field' + i] = true;
				return bucket.replace('tomato-0', data.value, {
					cas: data.cas,
					expiry: 5,
				}, callback);
			});
		}

		for (var i = 0; i < 10; ++i)
			registerTomatoField(i);

		return multi.execute(callback);
	});
});
