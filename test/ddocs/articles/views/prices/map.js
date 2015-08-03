function(doc) {
	if (doc.type === 'article')
		emit(doc.price);
}
