// ==UserScript==
// @name        Dobrochan Bookmarks Page Updater
// @namespace   dc_bkmrks_updater
// @description Keeps bookmarks page up to date & notifies of changes.
// @include     *dobrochan.*/bookmarks
// @homepage    https://github.com/Unknowny/dobroscript
// @updateURL   https://github.com/Unknowny/dobroscript/raw/master/Dobrochan Bookmarks Page Updater.user.js
// @downloadURL https://github.com/Unknowny/dobroscript/raw/master/Dobrochan Bookmarks Page Updater.user.js
// @version     1.0.3
// ==/UserScript==

var d = document,
    to = 1000 * 60 * 10; // check every 10 min

function favBlink () {
    d.title = '*' + d.title;
    $(d).one('focus', function () {
        d.title = d.title.substr(1);
    });
}

function updateContainer (resp) {
    $('table.threadlist tbody').remove();
    $('table.threadlist').append($('tbody', resp));
}

function main() {
    $.get(location.href)
    .done(function(resp) {
        if ( $('.highlight b', resp).length && $('tbody', resp).html() != $('tbody').html() )
            favBlink();

        updateContainer(resp);
    })
    .always(function() {
        var rand = Math.floor(Math.random() * 60 * 1000);
        setTimeout(main, to + rand);
    });
}

setTimeout(main, to);