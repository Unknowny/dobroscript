// ==UserScript==
// @name        Dobrochan Bookmarks Page Updater
// @namespace   dc_bkmrks_updater
// @description Keeps bookmarks page up to date & notifies of changes.
// @include     *dobrochan.*/bookmarks
// @homepage    https://github.com/Unknowny/dobroscript
// @updateURL   https://github.com/Unknowny/dobroscript/raw/master/Dobrochan Bookmarks Page Updater.user.js
// @downloadURL https://github.com/Unknowny/dobroscript/raw/master/Dobrochan Bookmarks Page Updater.user.js
// @version     1
// ==/UserScript==

var d = document;

function favicBlink() {
	d.title='*'+d.title;
	$(d).one('focus', function(){d.title=d.title.substr(1);});
}

function insertTable(resp) {
	$('table.threadlist tbody').remove();
	$('table.threadlist').append($('tbody', resp));
}

function check() {
	$.get(location.href, function(resp){
		if ( $('.highlight b', resp).length ){ favicBlink(); insertTable(resp); setTimeout(check, 17000); }
		else { insertTable(resp); setTimeout(check, 17000); }
	});
}

setTimeout(check, 17000);