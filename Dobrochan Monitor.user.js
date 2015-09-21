// ==UserScript==
// @name        Dobrochan Monitor
// @namespace   dc_monit
// @include     *dobrochan.*
// @exclude     *bookmarks
// @version     0.1
// @resource    monitor.css http://127.0.0.1:8080/resources/monitor.css
// @grant       GM_getResourceText
// @grant       GM_addStyle
// @grant       GM_getValue
// @grant       GM_setValue
// @require     https://ajax.googleapis.com/ajax/libs/jquery/2.1.3/jquery.min.js
// @require     http://127.0.0.1:8080/resources/moment-with-locales.min.js
// @run-at      document-end
// ==/UserScript==

// BEFORE RELEASE:
// git/resources/moment.js
// git/resources/monitor.css

// TODO:
// ------------css-------------
// files aligning
// remove class monitor shown
// ----------------------------
// click on new (or click on monitor when new is active) makes them seen, sends storage notice to main to update
// все же пользуй stats.json

// TODO FEATURES:
// chrome test
// вирнинг загрузки апи борд мешают нормальной работе фрейма
// should updateBoards call updateView implicitly?
// spoilers, quotes, links(preview) - even in title ( no pre )
// loading indicator (boardname in a spinning hollow circle), storage message
// lazy-load?
// completely switch to relative units?
// preserve tab scroll?
// pics rating?

// BUGS:
// resurfaced threads marked as new

// Constant Values /////////////////////////////
////////////////////////////////////////////////

var default_upd_time = 1000 * 60 * 8;
var desolated_upd_time = default_upd_time * 2.6;
var idle_upd_time = 1000 * 60 * 40;

// no user activity (clicks, scrolls..)
var consider_idle_time = 1000 * 60 * 40;

// for crash recovery
var tick_time = 1000 * 30;

var diff_url = '/api/chan/stats/diff.json';

var list_limit = 30;
var existing_boards = 'b u rf dt vg r cr lor mu oe s w hr a ma sw hau azu tv cp gf bo di vn ve wh fur to bg wn slow mad d news'.split(' ');
var default_settings = {boards: ['b', 'azu']};


// Shims, Helpers, Shortcuts ///////////////////
////////////////////////////////////////////////

var log = console.log.bind(console);

if (!String.prototype.includes) {
    String.prototype.includes = function() {'use strict';
       return String.prototype.indexOf.apply(this, arguments) !== -1;
    };
}

// Logic ///////////////////////////////////////
////////////////////////////////////////////////

var is_active_tab = false;
var user_activity = Date.now();
var settings;
var boards;

function loadSettings () {
    var s = JSON.parse(GM_getValue('settings'));
    if (s)
        settings = s;
    else
        settings = default_settings;
    log('load settings', settings);
}

function dumpSettings () {
    send('settings');
    GM_setValue('settings', JSON.stringify(settings));
    log('dump settings', settings);
}

function loadStorage () {
    boards = JSON.parse(localStorage.getItem('monitor_boards'));

    for (name in boards) {
        boards[name].threads.forEach(function (thread) {
            thread.posts.forEach(function (post) {
                post.thread = thread;
            });
        });
    }
    log('load storage');
}

function dumpStorage () {
    localStorage.setItem('monitor_boards', JSON.stringify(boards, jsonStrip));
    log('dump storage');
}

function jsonStrip (k, v) {
    // for JSON.stringify() method
    // strips cyclic references
    // e.g. post.thread.posts[0].thread....
    if (k !== 'thread')
        return v;
}

function setupBoards (names) {
    log('resetup boards', names);

    if (!boards)
        boards = {};

    // append new, reshow hidden
    names.forEach(function (name) {
        if (!boards[name])
            boards[name] = {'threads': [], 'last_update': 0, 'hidden': false};
        else
            boards[name].hidden = false;
    });

    // hide removed
    for (name in boards) {
        if (names.indexOf(name) === -1)
            boards[name].hidden = true;
    }
};

function updateBoard (name) {
    var defer = $.Deferred();
    var board = boards[name];

    log('request /' + name);
    $.get('/' + name + '/0.json')
    .done(function (data) {
        log('response /' + name);
        board.last_update = Date.now();
        processResponse(name, data);
        log(board);
        defer.resolve();
    })
    .fail(function () {
        log('request fail /' + name, arguments);
        defer.reject();
    });
    return defer.promise();
}


function isDesolated (boardname) {
    // if the board wasn't active for more than 5 hours
    return (Date.now() - lastPostDate(boardname) > 1000 * 60 * 60 * 5);
}

function lastPostDate (boardname) {
    return boards[boardname].threads.reduce(function (val, thread) {
        var last_post = thread.posts[0].date;
        if (val < last_post)
            return last_post;
        else
            return val;
    }, 0);
}

function updateBoards () {
    // updates all boards that need to be updated

    // collect out of date boards
    to_query = settings.boards.filter(function (name) {
        var board = boards[name];

        var update_time = default_upd_time;

        if (isDesolated(name))
            update_time = desolated_upd_time;

        if (Date.now() - user_activity > consider_idle_time)
            update_time = idle_upd_time;


        if (Date.now() - board.last_update > update_time)
            return true;
    });

    if (!to_query.length)
        return;

    // request diff api and filter out boards without new posts
    $.ajax(diff_url, {dataType: 'json', headers: {'Referer': ''}})
    .done(function (diff) {
        to_query = to_query.filter(function (boardname) {
            // any new posts
            return diff[boardname] > 0;
        });

        if (!to_query.length)
            return

        var redraw = false; // redraw only if any request was succesful
        var fraction = 100/to_query.length/2; // %
        var done = 0; // %
        function sequential () {
            if (!to_query.length) {
                // last call

                // if at least one board was retreived then update lists
                if (redraw) {
                    dumpStorage();
                    updateView('lists');
                }
                return;
            }

            var name = to_query.splice(0, 1);
            var board = boards[name];

            done += fraction;
            loading(done);

            updateBoard(name)
            .done(function () {
                redraw = true;
            })
            .always(function () {
                done += fraction;
                loading(done);
                sequential();
            });
        }
        sequential();
    });

}


function processResponse (boardname, data) {
    threads = data.boards[boardname].threads;

    function parseDate (string) {
        return (new Date(string.replace(' ', 'T'))).getTime();
    }

    threads.forEach(function (thread) {
        var prev_version;

        // get previously loaded version of a thread
        boards[boardname].threads.every(function (t) {
            if (t.display_id === thread.display_id) {
                prev_version = t;
                return false;
            }
            else
                return true;
        });

        thread.last_modified = parseDate(thread.last_modified);
        thread.last_hit = parseDate(thread.last_hit);
        thread.posts.reverse();
        thread.posts.forEach(function (post) {
            post.boardname = boardname;
            post.thread = thread;
            post.date = parseDate(post.date);
        });

        if (!prev_version) {
            thread.pseudo_cr_date = thread.posts.slice(-1)[0].date;
            // if not the first board retrieval
            if (!boards[boardname])
                thread.new_ = true;
            else {
                thread.new_ = false;
            }
        }
        else {
            thread.pseudo_cr_date = prev_version.pseudo_cr_date;
            thread.new_ = prev_version.new_;
        }
    });

    threads = threads.sort(function (a, b) {
        return a.display_id < b.display_id;
    });

    boards[boardname].threads = threads;
}

function startActive () {
    log('active started');
    is_active_tab = true;
    localStorage.setItem('monitor_active_exists', 1);

    (function tick (argument) {
        // in case of emergencies (browser crash)
        localStorage.setItem('monitor_active_tick', Date.now());
        setTimeout(tick, tick_time);
    })()

    updateBoards();
    setInterval(updateBoards, default_upd_time + 1000);

    $(window)
    .on('beforeunload', function () {
        log('active close');
        localStorage.setItem('monitor_active_exists', 0);
    })
    .on('focus mousedown scroll', function () {
        user_activity = Date.now();
    })
    .on('storage', function (e) {
        e = e.originalEvent;
        switch (e.key) {
            case 'monitor_settings':
                log('storage', e.key);
                loadSettings();
                setupBoards(settings.boards);
                dumpStorage();
                updateView('settings lists');
                updateBoards();
                break;
            case 'monitor_user_activity':
                user_activity = Date.now();
                break;
        }
    });
}

function setActive () {
    $(window).off('storage focus mousedown scroll');
    startActive();
}

function startSlave () {
    log('slave started');
    $(window)
    .on('focus mousedown scroll', function () {
        send('user_activity');
    })
    .on('storage', function (e) {
        e = e.originalEvent;
        switch (e.key) {
            case 'monitor_active_exists':
                log('storage', e.key);
                if (!activeTabExists())
                    setActive();
                break;
            case 'monitor_update_view':
                var what = recv('update_view');
                log('storage', e.key, what);
                loadStorage();
                loadSettings();
                if (!what.includes('lists'))
                    updateView(what);
                else {
                    log('defer')
                    // balance load across tabs
                    setTimeout(function () {updateView(what);}, Math.random() * 3000)
                }
                break;
            case 'monitor_loading':
                log('storage', e.key);
                loading(recv('loading'));
                break;

        }
    });
}

function activeTabExists () {
    return Boolean(parseInt(localStorage.getItem('monitor_active_exists')));
}


function send (k, v) {
    localStorage.setItem('monitor_' + k, JSON.stringify([Date.now(), v]));
}

function recv (k) {
    var v = localStorage.getItem('monitor_' + k);
    return JSON.parse(v)[1];
}

// View ////////////////////////////////////////
////////////////////////////////////////////////

function setupView () {

    // setup css
    GM_addStyle(GM_getResourceText('monitor.css'));

    // library for "1 second ago" date format
    moment.locale('ru');

    var html =  '<div id="monitor" class="reply">\
                    <div id="monitor-close" class="reply">x</div>\
                    <div id="monitor-tabs" class="header">\
                        <div id="monitor-new" class="active tab reply">новые</div>\
                        <div id="monitor-active" class="tab reply">активные</div>\
                        <div id="monitor-posts" class="tab reply">посты</div>\
                        <div id="monitor-files" class="tab reply">файлы</div>\
                        <div id="monitor-loading" class="active"><div class="line"></div></div>\
                    </div>\
                    <div id="monitor-listing" class="reply">\
                        <div id="monitor-new-list" class="active"></div>\
                        <div id="monitor-active-list"></div>\
                        <div id="monitor-posts-list"></div>\
                        <div id="monitor-files-list">\
                            <div></div>\
                            <div></div>\
                            <div></div>\
                            <div></div>\
                        </div>\
                    </div>\
                    <div>\
                        Следить за: <input id="monitor-boards" placeholder="доски через пробел">\
                        <button id="monitor-save">Сохранить</button>\
                    </div>\
                </div>';

    var popup = $(html).hide();
    popup.find('#monitor-boards').val(settings.boards.join());

    popup.find('#monitor-tabs > div').click(switchTab);
    popup.find('#monitor-save').click(saveSettingsButton);
    popup.find('#monitor-close').click(togglePopup);
    $('body').on('click', '.monitor-toggle', togglePopup);

    $('a[href$=bookmarks]').after(' | <a class="monitor-toggle">Монитор</a>');
    $('body').append(popup);
}

function loading (percent) {
    if (is_active_tab)
        send('loading', percent);

    var node = $('#monitor-loading');
    node.addClass('active').css('width', percent + '%');
    if (percent >= 100) {
        setTimeout(function () {
                node.removeClass('active');
                setTimeout(function () {
                    node.css('width', '0');
                }, 1500);
        }, 500);
    }
}

function togglePopup (argument) {
    var popup = $('#monitor');
    if (popup.is(':hidden'))
        $('.monitor-toggle').removeClass('bold');
    popup.toggle(0);
}

function switchTab (e) {
    var node = $(this);

    if (node.hasClass('active'))
        return;

    // strip highlighting from "new"
    if (node.is('#monitor-new'))
        node.removeClass('bold');

    $('#monitor-tabs div.active').removeClass('active');
    node.addClass('active');

    $('#monitor-listing').scrollTop(0);

    $('#monitor-listing div.active').removeClass('active');
    $('#' + node.attr('id') + '-list').addClass('active');
}

function saveSettingsButton (e) {
    var s = collectSettings();

    settings = s;
    if (is_active_tab) {
        setupBoards(settings.boards);
        dumpStorage();
        dumpSettings();
        updateBoards();
        updateView('settings lists');
    }
    else
        dumpSettings();
}

function collectSettings () {
    var boardnames = $('#monitor-boards').val().split(' ');
    boardnames = boardnames.filter(function (name) {
        name = name.trim();
        if (name && existing_boards.indexOf(name) > -1) {
            return true;
        }
    });
    return {boards: boardnames};
}

function timeago (timestamp) {
    if (timestamp > Date.now()) // posts from the future - oooOOooOo
        return moment().fromNow();
    else
        return moment(timestamp).fromNow();
}

function sortByKey (array, key, reverse) {
    return array.sort(function (a, b) {
        return reverse ? a[key] < b[key] : a[key] > b[key];
    });
}

function sortByActivity (threads) {
    return threads.sort(function (a, b) {

        // if difference between threads activity less than 20 min
        var range = 1000 * 60 * 20;
        var a_last = a.posts[0].date;
        var b_last = b.posts[0].date;
        if (Math.abs(a_last - b_last) < range) {
            var ab_last = a_last > b_last ? a_last : b_last;
            // count of posts in those 20min
            var a_n = b_n = 0;
            a.posts.forEach(function (p) {
                if (p.date >= ab_last - range)
                    a_n++;
            });
            b.posts.forEach(function (p) {
                if (p.date >= ab_last - range)
                    b_n++;
            });
            if (a_n === b_n)
                return a_last < b_last;
            else
                return a_n < b_n;
        }
        else
            return a_last < b_last;
    });
}

function updateView (what) {
    if (is_active_tab)
        send('update_view', what)

    log('update view (' + what + ')');

    // Settings

    if (what.includes('settings'))
        $('#monitor-boards').val(settings.boards.join(' '));

    // Lists

    if (!what.includes('lists'))
        return;

    // grab all the stuff
    var all_posts = [], all_threads = [];
    for (name in boards) {
        if (boards[name].hidden)
            continue;

        boards[name].threads.forEach(function (thread) {
            all_threads.push(thread);
            all_posts = all_posts.concat(thread.posts);
        });
    }

    // Posts

    var posts = sortByKey(all_posts, 'date', true);
    var html = '';
    posts.slice(0, list_limit).forEach(function (post) {
        var boardname = post.boardname;
        var href = '/' + boardname + '/res/' + post.thread.display_id + '.xhtml#i' + post.display_id;
        var title = post.message;

        // >>DDDD>>DDDDD...
        var reply_pattern = /(>>(\/?\w+\/)?\d+\s*)+/;

        // messages that only conatain replies
        var only_reply = RegExp('^\s*' + reply_pattern.source + '\s*$').test(title);

        if (!title || only_reply) {
            if (post.files.length) {
                // if image only post

                var m = post.files[0].src.split('/');
                title = m.slice(-3)[0] + '/' + m.slice(-1)[0];
            }
        }
        else if (!only_reply) {
            // strip ^>>DDDD from title
            title = title.replace(RegExp('^\s*' + reply_pattern.source + '\s*'), '');
        }

        var thumbs_html = post.files.reduce(function (html, file) {
            html += '<img src="/' + file.thumb + '">';
            return html;
        }, '');

        html += '<div class="item">' +
                        '<span class="boardname">' + boardname + '</span> — <a href="' + href + '">' + title + '</a><br>' +
                        '<span class="left-padding"><span class="boardname">' + boardname + '</span> </span>' +
                        '<span class="shortinfo">' + post.thread.title + ' — ' + timeago(post.date) + '</span>' +
                    '</div>' +
                    '<div class="info">' +
                        '<div class="reply">' +
                            '<span class="thumbs">' +
                                thumbs_html +
                            '</span>' +
                            '<span class="message">' +
                                post.message +
                            '</span>' +
                        '</div>' +
                    '</div>';
    });
    $('#monitor-posts-list')[0].innerHTML = html;

    // New

    var threads = sortByKey(all_threads, 'pseudo_cr_date', true);
    var html = '';
    threads.slice(0, list_limit).forEach(function (thread) {
        // if any new threads
        // make main button bold
        if (thread.new_ && $('#monitor').is(':hidden')) {
            $('.monitor-toggle').addClass('bold');
        }
        else if (thread.new_ && $('#monitor-new-list').is(':hidden')) {
            // make tab button bold
            $('#monitor-new').addClass('bold');
        }

        var boardname = thread.posts[0].boardname;
        var href = '/' + boardname + '/res/' + thread.display_id + '.xhtml';
        var title = thread.title || ('>>' + thread.display_id);

        html += '<div class="item' + (thread.new_ ? ' new' : '') + '">' +
                        '<span class="boardname">' + boardname + '</span> — <a href="' + href + '">' + title + '</a><br>' +
                        '<span class="left-padding"><span class="boardname">' + boardname + '</span> </span>' +
                            '<span class="shortinfo">(' + thread.posts_count + ')' + ' активен ' + timeago(thread.last_hit) +'</span>' +
                    '</div>';
    });
    $('#monitor-new-list')[0].innerHTML = html;

    // Active

    var threads = sortByActivity(all_threads);
    var html = '';
    threads.slice(0, list_limit).forEach(function (thread) {
        var boardname = thread.posts[0].boardname;
        var href = '/' + boardname + '/res/' + thread.display_id + '.xhtml';
        var title = thread.title || ('>>' + thread.display_id);
        var date = thread.posts[0].date;
        var time = '<time datetime="' + (new Date(date)).toISOString() + '">' + timeago(date) + '<time>';

        html += '<div class="item' + (thread.new_ ? ' new' : '') + '">' +
                    '<span class="boardname">' + boardname + '</span> — <a href="' + href + '">' + title + '</a><br>' +
                    '<span class="left-padding"><span class="boardname">' + boardname + '</span> </span>' +
                        '<span class="shortinfo">(' + thread.posts_count + ')' + ' активен ' + timeago(thread.last_hit) +'</span>' +
                '</div>';
    });
    $('#monitor-active-list')[0].innerHTML = html;;

    // Files

    // columns of images
    var cols = [
        {i: 0, h: 0, html: ''},
        {i: 1, h: 0, html: ''},
        {i: 2, h: 0, html: ''},
        {i: 3, h: 0, html: ''},
    ];
    var max_height = 1000;

    // filled from cols as they exceed the max_height
    var cols_result = {};

    var n = 0;
    posts.every(function (post) {

        // for breakout
        var outer = true;

        if (!post.files.length)
            return true;

        var post_url = '/' + post.boardname + '/res/' + post.thread.display_id + '.xhtml#i' + post.display_id;

        post.files.every(function (file) {
            var w = file.thumb_width;
            var h = file.thumb_height;

            var max_w = 88;
            if (w > max_w) {
                mul = max_w/(w/100)*.01;
                w = parseInt(w*mul);
                h = parseInt(h*mul);
            }

            var col = n%cols.length;

            var fname = file.src.split('/').slice(-1)[0];
            var html = '<div class="item reply">' +
                            '<a href="' + post_url + '" class="post">post</a>' +
                            '<a href="/' + file.src + '">' +
                                '<img title="' + fname + '" width="' + w + '" height="' + h + '" src="/' + file.thumb + '">' +
                            '</a>' +
                        '</div>' +
                        '<div class="info">'+
                            '<div class="reply" style="width:' + file.thumb_width + 'px;">' +
                                '<img src="/' + file.thumb + '"><br>' +
                                timeago(post.date) + '<br>' +
                                'в "' + post.thread.title + '"<hr>' +
                                '<span class="message">' + post.message + '</span>' +
                            '</div>' +
                        '</div>';
            cols[col].html += html;

            cols[col].h += h;
            if (cols[col].h >= max_height)
                cols_result[cols[col].i] = cols.splice(col, 1)[0].html;

            n++;

            // break if no more rows to fill
            outer = cols.length;
            return cols.length;
        });
        return outer;
    });
    $('#monitor-files-list > div').each(function (i) {
        this.innerHTML = cols_result[i];
    });
}

// Main ////////////////////////////////////////
////////////////////////////////////////////////

loadSettings();
loadStorage();
setupBoards(settings.boards);
setupView();
updateView('settings lists');

var active_last_tick = parseInt(localStorage.getItem('monitor_active_tick') || 0);

if (!activeTabExists() || (Date.now() - active_last_tick > tick_time * 2))
    startActive();
else
    startSlave();
