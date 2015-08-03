# couchbase-utils

Convenience functions to better work with [Couchbase Node.js SDK](https://github.com/couchbase/couchnode). Includes some bug fixes.

	npm install --save couchbase-utils

## Instantiation

	var utils = require('couchbase-utils')(options);

`options` is an Object with following fields:

- `bucket`: mandatory
- `ddocsHashAlgorithm`: used when updating ddocs, default is `sha256`
- `ddocsPath`: where the ddocs are, default is `./ddocs`
- `ddocsRemoveHook`: executed before a ddoc is removed, default is to accept the removal of production views and to reject the removal of development views
- `ddocsUpdateHook`: executed before a ddoc is updated, default is to accept the update of newest ddocs
- `fix`: whether to fix implementations, default is `false`
- `maxDelay`: upper limit of the retry delay, which otherwise grows exponentially, default is 1 second
- `timeout`: maximum retry time for `retry` in seconds, default is 10 seconds

I discovered some bugs in the implementation regarding the queries and the mock. Until [this PR is merged](https://github.com/couchbase/couchnode/pull/27), I strongly recommend to set `fix` to `true`, in order to fix those behaviors.

## utils.Multi

Multi is a class for executing functions in the context of retrieved documents.  

	var info;
	var multi = new utils.Multi();
	
	multi.register(docId, function(data, callback) {
		if (data.err) return callback(data.err);
		info = data.value.info;
		return callback();
	});

	multi.execute(function(err) {
		if (err) throw err;
		console.log(ingfo);
	});

### multi.register(docId, function(data, callback))

Register a doc id with an associated handler function. You can register the same doc id multiple times, and all associated handlers will be executed.

The function receives a `data` object with following fields:

- `err` if an error occurred (including if the doc id doesn't exist)
- `value` (document)
- `cas`

The function is asynchronous, i.e. you have to call `callback` to continue the processing. Optionally pass an `Error` object as argument to notify an error back to `execute`.

### multi.execute(callback)

After registering all doc ids, call `execute` to actually retrieve the documents and execute all registered handlers.

The callback function may have an `Error` argument, which is the first error notified by a processing function. It is `undefined` if all handlers have succeeded.

It works even if there is no registered handler.

## utils.provide(query, [params,] function(row, callback), callback)

Yields rows from the query, as long as a condition is true.

`query` is the query object. `params` is an optional object or array to do replacements on a N1QL query.

The function is executed for every row the query yields. It receives a `row` object with following fields:

- `id`
- `key`
- `value`

The function is asynchronous, i.e. you have to call `callback` to continue the processing. The first argument may be an `Error` object if an error occurred, or `null`. The second argument is a boolean deciding whether `provide` should continue to yield rows. When this boolean is `false`, or there is no more rows to yield, the provision loop exits and the execution continues by calling `callback`.

It is strongly advised to set a `limit` to the `query`, in order to retrieve rows in small batches. Indeed, `provide` will retrieve a first batch, and if this batch is depleted while it should still yield rows, then another batch is retrieved, etc. Therefore you should calculate the ideal size of batches. If you don't set `limit`, all rows are retrieved in a single batch, which may be suboptimal.

	
	var query = couchbase.ViewQuery.from('stocks', 'quantities')
		.limit(3);
	
	var quantity = 0;
	var productIds = [];
	
	utils.provide(query, function(row, callback) {
		quantity += row.key;
		productIds.push(row.value);
		return callback(null, quantity < 40);
	}, function(err) {
		if (err) throw err;
		console.log(productIds);
	});

## utils.retry(function(callback), callback)

They are two reasons to always wrap your calls to Couchbase in a `retry` call:

1. Couchbase sometimes delivers "temporary" errors, which are not fatal errors, but signal a temporary failure state. `retry` will execute again the function with an exponential delay, bounded by `options.maxDelay` seconds, as defined at the instantiation.
2. when using optimistic locking, while you get, edit, and replace a document, it may have been edited and replaced by another code. `retry` allows for starting again the edit process.

In any case, `retry` won't execute again the function if it took more time than `options.timeout` seconds, as defined at the instantiation.

The arguments of the first argument's callback are forwarded to the second argument.

	// Note that this example serves only to show the logic of retry
	// If you only want to increment a number, consider using an atomic counter, or Redis
	utils.retry(function(callback) {
		return bucket.get(docId, function(err, data) {
			if (err) {
				if (err.code !== couchbase.errors.keyNotFound) return callback(err);
				return bucket.insert(docId, {
					views: 1,
				}, function(err) {
					return callback(err, 1);
				});
			}

			++data.value.views;
			return bucket.replace(docId, data.value, {
				cas: data.cas,
			}, function(err) {
				return callback(err, data.value.views);
			});
		});
	}, function(err, views) {
		if (err) throw err;
		console.log(views);
	};

In this example, `bucket.get` and `bucket.insert` / `bucket.replace` are wrapped in the same `retry` call, so that if the document update fails, `bucket.get` is executed again, etc.

All accesses to Couchbase in this library are already wrapped in `retry` calls. For instance, you can safely do:

	var multi = new utils.Multi();
	
	multi.register(docId, function(data, callback) {
		if (data.err) return callback(data.err);
		data.value.foo = 'bar';
		return bucket.replace(docId, data.value, {
			cas: data.cas,
		}, callback);
	});

	multi.execute(function(err) {
		if (err) throw err;
	});

Note that the registered handlers may therefore be called several times, e.g. in case of a CAS mismatch. Thus take care not to leak states between multiple calls to the same handler. By design, all handlers will be executed again in case of error.

## utils.updateDdocs(callback)

Updates design documents from the filesystem, or removes those which don't exist anymore.

The directory containing the ddocs (`options.ddocsPath` at the instantiation) directly translates to a JS object, and should therefore have the following structure:

	./ddocs/
		<ddoc name>/
			views/
				<view name>/
					map.js
					[reduce.js]
				<view name>/
					...
		<ddoc name>/
			...

Consequently, `map.js` is mandatory and contains a top-level function, and `reduce.js` is optional and can contain a function or one of the built-in reduce functions (`_count`, `_sum`, `_stats`).

	function(doc, meta) {
		if (doc.visible)
			emit(doc.layerIndex, doc.geometry);
	}

In order to update a ddoc, a hook function (`options.ddocsUpdateHook`) is called, which asynchronously returns a boolean indicating whether the ddoc has to be updated. The function has the arguments `(ddocName, localDdoc, remoteDdoc, callback)` where the ddocs are JS objects. The default hook compares the local and the remote ddocs using a hash.

The same logic applies to a ddoc removal (`options.ddocsRemoveHook`). The arguments are `(ddocName, remoteDdoc, callback)`. The default implementation removes the production views and leaves the development views.

	ddocsRemoveHook: function(ddocName, remoteDdoc, callback) {
		return callback(null, (ddocName.lastIndexOf('dev_', 0) === -1));
	}

### utils.updateDdocs.hash(ddoc)

For convenience, this function returns the hash of an object.

## Tests & examples

Browse the repertory `test` to see actual usages of this library. The tests work both with the real and the mock implementation. 

## License

Copyright (c) 2015 Jonathan Giroux "Bloutiouf"

[MIT License](http://opensource.org/licenses/MIT)
