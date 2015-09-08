// ==UserScript==
// @name        Dobrochan Thread Update Checker
// @namespace   dc_update_checker
// @description Notifies you of new posts.
// @include     *dobrochan.*/res/*
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       unsafeWindow
// @require     https://ajax.googleapis.com/ajax/libs/jquery/2.1.3/jquery.min.js
// @homepage    https://github.com/Unknowny/dobroscript
// @updateURL   https://github.com/Unknowny/dobroscript/raw/master/Dobrochan Thread Update Checker.user.js
// @downloadURL https://github.com/Unknowny/dobroscript/raw/master/Dobrochan Thread Update Checker.user.js
// @version     1.0.4
// ==/UserScript==

function makePopup () {
    var div = $('<div class="reply"></div>');
    div.css({
            'top':'25px',
            'right':'25px',
            'position':'fixed',
            'cursor':'pointer',
            'padding':'4px',
            'box-shadow':'2px 2px rgba(0, 0, 0, 0.12)',
            'border':'1px solid black',
            'display':'none'
        })
        .on('click', function () {location.reload();})
        .text(unsafeWindow.Hanabira.LC_ru ? 'Новые посты. Обновить страницу.' : 'New posts. Reload page.');
    return div;
}

function faviconBlink () {
    d.title = '*' + d.title;
    $(d).one('focus', function () {d.title = d.title.substr(1);});
}

function separateSeen () {
    var last_ids = GM_getValue(board + thread, '').split(',');
    last_ids.every(function (id) {
        var post_node = $('#post_' + id);
        if (post_node.length) {
            post_node.after('<hr id="separator">');
            return false;
        }
        else
            return true;
    });
}

function notify () {
    popup.fadeIn();
    faviconBlink();
}

function check () {
    $.get('/api/thread/' + board + '/' + thread + '/new.json?last_post=' + last_id, function(resp) {
        if (resp.posts) {
            GM_setValue(board + thread, last_ids.join(','));
            notify();
        }
        else
            setTimeout(check, 20000);
    });
}

// Main
var d = document;
var popup = makePopup();
var board = location.pathname.match(/[a-z]+/)[0];
var thread = location.pathname.match(/\d+/)[0];
var last_id = $('.post:last').attr('id').substr(5);
var last_ids = $('.post').slice(-4)
                         .map(function () {return this.id.substr(5);})
                         .get()
                         .reverse();

separateSeen();
$('body').append(popup);
setTimeout(check, 20000);
