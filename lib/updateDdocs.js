var async = require('async');
var crypto = require('crypto');
var directoryContents = require('directory-contents');
var objectHash = require('object-hash');

module.exports = function(options, retry) {
	var hashAlgorithm = options.ddocsHashAlgorithm || 'sha256';
	if (crypto.getHashes().indexOf(hashAlgorithm) === -1)
		throw new Error(hashAlgorithm + ' is not available');

	function hash(obj) {
		return objectHash(obj, {
			algorithm: hashAlgorithm
		});
	}

	var ddocsPath = options.ddocsPath || './ddocs';

	var ddocsRemoveHook = options.ddocsRemoveHook || function(ddocName, remoteDdoc, callback) {
		return callback(null, (ddocName.lastIndexOf('dev_', 0) === -1));
	};

	var ddocsUpdateHook = options.ddocsUpdateHook || function(ddocName, localDdoc, remoteDdoc, callback) {
		if (remoteDdoc) {
			var localHash = hash(localDdoc);
			var remoteHash = hash(remoteDdoc);
			
			if (localHash === remoteHash)
				return callback(null, false);
		}
		
		return callback(null, true);
	};

	function updateDdocs(callback) {
		var bucketManager = options.bucket.manager();

		return async.parallel({
			remote: function(callback) {
				return retry(function(callback) {
					return bucketManager.getDesignDocuments(callback);
				}, callback);
			},
			local: function(callback) {
				return directoryContents(ddocsPath, {
					extensions: {
						'*': directoryContents.readText,
					},
				}, callback);
			}
		}, function(err, data) {
			if(err) return callback(err);

			return async.eachSeries(Object.keys(data.local), function(ddocName, callback) {
				var localDdoc = data.local[ddocName];
				var remoteDdoc = data.remote[ddocName];
				
				return ddocsUpdateHook(ddocName, localDdoc, remoteDdoc, function(err, ok) {
					if (err) return callback(err);
					if (!ok) return callback();
					return retry(function(callback) {
						return bucketManager.upsertDesignDocument(ddocName, localDdoc, callback);
					}, callback);
				});
			}, function(err) {
				if (err) return callback(err);

				return async.eachSeries(Object.keys(data.remote), function(ddocName, callback) {
					if (data.local[ddocName])
						return callback();

					var remoteDdoc = data.remote[ddocName];

					return ddocsRemoveHook(ddocName, remoteDdoc, function(err, ok) {
						if (err) return callback(err);
						if (!ok) return callback();
						return retry(function(callback) {
							return bucketManager.removeDesignDocument(ddocName, callback);
						}, callback);
					});
				}, callback);
			});
		});
	}

	updateDdocs.hash = hash;

	return updateDdocs;
};
