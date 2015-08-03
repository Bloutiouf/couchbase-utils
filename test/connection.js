var couchbase = require('couchbase');
var couchbaseUtils = require('../index');
var path = require('path');

// Comment this out to use the real server
couchbase = couchbase.Mock;

before('connects to the bucket', function(callback) {
	this.timeout(10000);
	var cluster = new couchbase.Cluster('couchbase://localhost');
	bucket = cluster.openBucket('test', function(err) {
		if (err) return callback(err);
		utils = couchbaseUtils({
			bucket: bucket,
			ddocsPath: path.join(__dirname, 'ddocs'),
			fix: true,
		});
		return callback();
	});
});
