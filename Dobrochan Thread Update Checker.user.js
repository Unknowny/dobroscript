// ==UserScript==
// @name        Dobrochan Thread Update Checker
// @namespace   dc_update_checker
// @description Notifies you of new posts.
// @include     *dobrochan.*/res/*
// @homepage    https://github.com/Unknowny/dobroscript
// @updateURL   https://github.com/Unknowny/dobroscript/raw/master/Dobrochan Thread Update Checker.user.js
// @downloadURL https://github.com/Unknowny/dobroscript/raw/master/Dobrochan Thread Update Checker.user.js
// @version     1.0.3
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
        .text(Hanabira.LC_ru ? 'Новые посты. Обновить страницу.' : 'New posts. Reload page.');
    return div;
}

function faviconBlink () {
    d.title = '*' + d.title;
    $(d).one('focus', function () {d.title = d.title.substr(1);});
}

function notify () {
    popup.fadeIn();
    faviconBlink();
}

function check () {
    $.get('/api/thread/' + board + '/' + thread + '/new.json?last_post=' + lastID, function(resp) {
        if (resp.posts) {
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
var lastID = $('.post:last').attr('id').substr(5);

$('body').append(popup);
setTimeout(check, 20000);
