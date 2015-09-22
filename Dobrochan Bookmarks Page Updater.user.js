// ==UserScript==
// @name        Dobrochan Bookmarks Page Updater
// @description Keeps bookmarks page up to date & notifies of changes.
// @namespace   dc_bkmrks_updater
// @include     *dobrochan.*/bookmarks
// @version     1.0.4
// @grant       none
// @require     https://ajax.googleapis.com/ajax/libs/jquery/2.1.3/jquery.min.js
// @homepage    https://github.com/Unknowny/dobroscript
// @updateURL   https://github.com/Unknowny/dobroscript/raw/master/Dobrochan Bookmarks Page Updater.user.js
// @downloadURL https://github.com/Unknowny/dobroscript/raw/master/Dobrochan Bookmarks Page Updater.user.js
// ==/UserScript==

var d = document,
    to = 1000 * 60 * 10; // check every 10 min

function faviconBlink () {
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
    console.log('fetching bookmarks page ' + new Date().toGMTString());
    $.get(location.href)
    .done(function(resp) {
        if ( $('.highlight b', resp).length && $('tbody', resp).html() != $('tbody').html() )
            faviconBlink();

        updateContainer(resp);
    })
    .always(function() {
        var rand = Math.floor(Math.random() * 60 * 1000); // ~1 min random
        setTimeout(main, to + rand);
    });
}

function threadLinkClick (e) {
    // removes bold font after thread link has been clicked
    if (e.which !== 3) {
        var b = $(e.target).parent().find('b')
        b.replaceWith(b.html())
    }
}

$(document.body).on('mouseup', 'tr.highlight td:first-child a:first-child', threadLinkClick)
setTimeout(main, to);
