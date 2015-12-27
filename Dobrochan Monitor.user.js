// ==UserScript==
// @name        Dobrochan Monitor
// @description Tracks new threads and posts on the board.
// @namespace   dc_monit
// @include     *dobrochan.*
// @version     1.3
// @grant       GM_getValue
// @grant       GM_setValue
// @require     https://ajax.googleapis.com/ajax/libs/jquery/2.1.3/jquery.min.js
// @require     https://raw.githubusercontent.com/Unknowny/dobroscript/master/resources/moment-with-locales.min.js
// @homepage    https://github.com/Unknowny/dobroscript
// @updateURL   https://github.com/Unknowny/dobroscript/raw/master/Dobrochan Monitor.user.js
// @downloadURL https://github.com/Unknowny/dobroscript/raw/master/Dobrochan Monitor.user.js
// ==/UserScript==

// TODO FEATURES:

// Constant Values ////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////

var default_upd_time = 1000 * 60 * 8;
var idle_upd_time = 1000 * 60 * 40;

// no user activity (clicks, scrolls..)
var consider_idle_time = 1000 * 60 * 40;

// for crash recovery
var tick_time = 1000 * 30;

var list_limit = 30;
var default_settings = {boards: ['b', 'azu'], filters: '', filter_files: false};
var existing_boards = 'b u rf dt vg r cr lor mu oe s w hr a ma sw hau azu tv cp gf bo di vn ve wh fur to bg wn slow mad d news'.split(' ');
var diff_url = '/api/chan/stats/diff.json';
var main_css_url = 'https://rawgit.com/Unknowny/dobroscript/master/resources/monitor.css?e';
// var main_css_url = 'http://127.0.0.1:8080/resources/monitor.css'

// Shims, Helpers, Shortcuts //////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////

var log = console.log.bind(console);

if (!String.prototype.includes) {
    String.prototype.includes = function() {'use strict';
       return String.prototype.indexOf.apply(this, arguments) !== -1;
    };
}

// Logic ///////////////////////////////////////
////////////////////////////////////////////////

var is_active_tab = false;
var settings = default_settings;
var boards;
var user_activity = Date.now();
var newest_thread_date = 0;

// library for date parsing and "1 second ago" format
moment.locale('ru');

function loadSettings () {
    var s = JSON.parse(GM_getValue('settings') || '{}');
    for (k in s)
        settings[k] = s[k]

    log('load settings', settings);
}

function dumpSettings () {
    GM_setValue('settings', JSON.stringify(settings));
    log('dump settings', settings);
    send('settings');
}

function loadStorage () {
    boards = JSON.parse(localStorage.getItem('monitor_boards'));

    for (var name in boards) {
        boards[name].threads.forEach(function (thread) {
            if (thread.pseudo_cr_date > newest_thread_date)
                newest_thread_date = thread.pseudo_cr_date;

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
    for (var name in boards) {
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
        defer.resolve();
    })
    .fail(function () {
        log('request fail /' + name, arguments);
        defer.reject();
    });
    return defer.promise();
}

function updateBoards () {
    // updates all boards that need to be updated

    // collect out of date boards
    to_query = settings.boards.filter(function (name) {
        var board = boards[name];

        var update_time = default_upd_time;

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
            var board = boards[boardname];
            if (board)
                var stale_data = Date.now() - board.last_update > 1000 * 60 * 60 * 6;
            // first retreival or
            // any new posts or
            // board was last reteived more than 6h ago
            return !board || diff[boardname] > 0 || stale_data;
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
                    newest_thread_date = newestThread().pseudo_cr_date;
                    updateView('lists');
                }
                return;
            }

            var name = to_query.splice(0, 1)[0];
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

function newestThread () {
    var newest_thread;
    for (var name in boards) {
        boards[name].threads.forEach(function (thread) {
            if (!newest_thread || thread.pseudo_cr_date > newest_thread.pseudo_cr_date)
                newest_thread = thread;
        });
    }
    return newest_thread;
}

function processResponse (boardname, data) {
    threads = data.boards[boardname].threads;

    function parseDate (string) {
        return moment(string).valueOf();
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
            // first thread retreival
            thread.pseudo_cr_date = thread.posts.slice(-1)[0].date;
            thread.new_ = true;

            // if first board retreival
            if (!boards[boardname].threads.length)
                thread.new_ = false;

            // if not new but bumped thread
            if (thread.pseudo_cr_date < newest_thread_date)
                thread.new_ = false;
        }
        else {
            thread.pseudo_cr_date = prev_version.pseudo_cr_date;
            thread.new_ = prev_version.new_;
        }
    });

    threads = threads.sort(function (a, b) {
        return b.display_id - a.display_id;
    });

    boards[boardname].threads = threads;
}

function markAllSeen () {
    for (var name in boards) {
        boards[name].threads.forEach(function (thread) {
            thread.new_ = false;
        });
    }
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
                updateView('watched lists');
                updateBoards();
                break;
            case 'monitor_seen_new':
                log('storage', e.key);
                updatesHaveBeenSeen();
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
                    // balance load across tabs
                    setTimeout(function () {updateView(what);}, Math.random() * 3000)
                }
                break;
            case 'monitor_seen_new':
                log('storage', e.key);
                updatesHaveBeenSeen();
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

// View ///////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////

var filters;

function parseFilters (text) {
    var mods_rx = /(^[ri]{1,3}):(.*)/;
    var rules = [];
    text.split('\n').forEach(function (line) {
        line = line.trim();
        if (line) {
            var m = mods_rx.exec(line);
            if (m) {
                var mods = m[1];
                var text = m[2];
            }
            else {
                var mods = '';
                var text = line;
            }

            if (!mods.includes('r'))
                var text = text.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");

            rules.push(
                {
                    rx: new RegExp(text, mods.includes('i') ? '' : 'i'),
                    // in_body: mods.includes('b')
                }
            );
        }
    });

    return rules;
}

function filterPass (string) {
    for (var i = filters.length - 1; i >= 0; i--) {
        if (filters[i].rx.test(string))
            return false;
    }
    return true;
}

var MarkParser = {
    // doesn't support lists

    _entities_map: {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': '&quot;',
        "'": '&#39;',
        "/": '&#x2F;'
    },
    escapeHtml: function (string) {
        return string.replace(/[&<>"'\/]/g, function (s) {
            return MarkParser._entities_map[s];
        });
    },

    _rules: [
        // some of the regexes were borrowed and modified
        // from dobropython-4.py that I found on google

        // [rx, substring or fn, keep_formatting:false]
        // the order is important

        // multiline code - "``"
        [ /^``\r?\n(.*(\r\n.*)*)\r\n``(\r?\n)?/gm, '<pre>$1</pre>', true],
        // code - "    "
        [ /^    (.+)(\r?\n)?/gm, '<pre>$1</pre>', true],
        // code - "`"
        [ /`(.+?)`/g, '<code>$1</code>', true],
        // multiline spoiler
        [ /^%%\r?\n(.*((\r?\n.*)*))\r?\n%%(\r?\n)?/gm, '<div class="spoiler">$1</div>'],
        // bold + italic
        [ /_(_|\*)\*(.+?)\*\1_/g, '<b><i>$2</b></i>'],
        // bold
        [ /(\*\*|__)(.+?)\1/g, '<b>$2</b>'],
        // italic
        [ /([\*_])(.+?)\1/g, '<i>$2</i>'],
        // spoiler
        [ /%%(.+?)%%/g, '<span class="spoiler">$1</span>'],
        // post >>board/post
        [ /&gt;&gt;(((&#x2F;)?([a-z])+&#x2F;)(\d+))/g, '<a href="/api/post/$4/$5.json?thread#redirect">&gt;&gt;$1</a>'],
        // post >>post
        [ /&gt;&gt;(\d+)/g, '<a href="/api/post/<board>/$1.json?thread#redirect">&gt;&gt;$1</a>'],
        // url
        [ /(https?:&#x2F;&#x2F;\S+)/g, '<a href="$1">$1</a>'],
        // quote
        [ /^\s*&gt;(.+)(\r?\n)?/gm, '<blockquote>&gt;$1</blockquote>'],
        // strikethrough char
        [ /.*?((?:\^H)+)/g, function (m, p) {
            var len = p.length / 2;
            var str = m.substring(0, m.length - p.length);
            if (/\s/.test(str[str.length-1]))
                return m;
            var rx = RegExp('[^\\s>]{1,' + len + '}$', 'g');
            return str.replace(rx, '<strike>$&</strike>')
        }],
        // strikethrough word
        [ /.*?((?:\^W)+)/g, function (m, p) {
            var len = p.length / 2;
            var str = m.substring(0, m.length - p.length);
            if (/\s/.test(str[str.length-1]))
                return m;
            var rx = RegExp('(?:[^\\s>]+\\s?){1,' + len + '}$', 'g');
            return str.replace(rx, '<strike>$&</strike>')
        }]
    ],
    to_html: function (text, boardname) {
        text = this.escapeHtml(text);
        text = this._translate(text, boardname);
        text = text.replace(/\r?\n/g, '<br>');
        return text;
    },
    _translate: function (text, boardname) {

        // pass additional arguments (board) to the replacer string|function
        var rules = this._rules.map(function (_rule) {
            var rule = _rule.slice();
            if (typeof rule[1] === 'string')
                rule[1] = rule[1].replace(/<board>/g, boardname);
            else
                rule[1] = rule[1].bind({board: boardname});
            return rule;
        });

        // for keep_formatting rules
        var stash = [/*match, match, ...*/];

        var i = 0;
        rules.forEach(function (rule, n) {
            if (!rule[2])
                text = text.replace(rule[0], rule[1]);
            else
                text = text.replace(rule[0], function (match) {
                    stash.push(match);
                    return '<!' + n + '-' + (i++) + '!>';
                });
        });

        text = text.replace(/<!(\d+)-(\d+)!>/g, function (m, group_i, stash_i) {
            var rule = rules[parseInt(group_i, 10)];
            var i = parseInt(stash_i, 10);
            return stash.slice(i, i+1)[0].replace(rule[0], rule[1]);
        });

        return text;
    }
};

function setupView () {
    // setup css
    $('head').append('<link rel="stylesheet" type="text/css" href="' + main_css_url + '">');

    var filters_help =
        'злотред - ищет "ЗЛОТРЕД", "ЗлотреД"...\n\
        i:злотред - ищет "злотред"\n\
        ir:зл[Оо]тред - ищет "злотред" или "злОтред"\n\
        \n\
        Одно правило на строку.\n\
        Модификаторы правил:\n\
         i - включить чувствительность к регистру\n\
             (отключено по умолчанию)\n\
         r - регексп'.replace(/\n\s{8}/g, '\n');
     var html =
        '<div id="monitor" class="reply">\
            <div id="monitor-icons">\
                <div id="monitor-filtered-out-icon"></div>\
                <div id="monitor-settings-open" data-tab="settings" class="tab"></div>\
                <div id="monitor-close" class="reply">x</div>\
            </div>\
            <div id="monitor-tabs" class="header">\
                <div id="monitor-new" data-tab="new-list" class="active tab reply">новые</div>\
                <div id="monitor-active" data-tab="active-list" class="tab reply">активные</div>\
                <div id="monitor-posts" data-tab="posts-list" class="tab reply">посты</div>\
                <div id="monitor-files" data-tab="files-list" class="tab reply">файлы</div>\
                <div id="monitor-loading" class="active"><div class="line"></div></div>\
            </div>\
            <div id="monitor-listing">\
                <div class="monitor-new-list active"></div>\
                <div class="monitor-active-list"></div>\
                <div class="monitor-posts-list"></div>\
                <div class="monitor-files-list"></div>\
                \
                <div id="monitor-settings" class="monitor-settings">\
                    <div class="title reply">Фильтры</div>\
                    <div class="block">\
                        Фильтр по названию треда \
                            <a class="help">[?]</a>:\
                            <span class="help-tooltip reply"><pre>' + filters_help + '</pre></span>\
                        <br>\
                        <textarea id="monitor-s-filters"></textarea><br>\
                        <label>Фильтровать файлы: <input id="monitor-s-filter-files" type="checkbox"></label>\
                    </div>\
                    <div class="title reply">Горячие клавиши</div>\
                    <div class="block">\
                        [m] - открыть/закрыть монитор (глобальная)<br>\
                        [q], [esc] - закрыть монитор<br>\
                        [f] - показать отфильтрованные записи<br>\
                    </div>\
                    <hr>\
                    <center><button id="monitor-s-save" class="">Применить</button></center>\
                </div>\
            </div>\
            <div id="monitor-bottom-panel" class="reply">\
                Следить за: <input id="monitor-boards" placeholder="доски через пробел">\
                <button id="monitor-save-boards">Сохранить</button>\
            </div>\
        </div>';

    var gui = $(html.replace(/>\s+</g, '><'));

    // duplicate every listing type for unfiltered results
    gui.find('#monitor-listing > div[class*="-list"]').each(function () {
        var node = $(this);
        node.after(node.clone().addClass('filtered-out'));
    })

    // .hide() prevents gui from showing up before appropriate css rule is loaded
    gui.hide();

    gui.find('#monitor-boards').val(settings.boards.join());

    // attach gui toggles to dom
    $('a[href$=bookmarks]').after(' | <a class="monitor-toggle">Монитор</a>');
    // attach main gui container to dom
    $('body').append(gui);

    bindGuiEvents();
}

function bindGuiEvents() {
    var gui = $('#monitor');

    gui.find('#monitor-settings-open').click(function () {
        if (!$(this).hasClass('active'))
            fillGuiSettings();
    });
    gui.find('.tab').click(switchTab);
    gui.find('#monitor-save-boards').click(saveWatchedButton);
    gui.find('#monitor-s-save').click(saveGuiSettings);
    gui.find('#monitor-filtered-out-icon').click(function () {
        $('#monitor').toggleClass('filtered-out');
    });
    gui.find('#monitor-boards').on('keyup', function (e) {
        if (e.keyCode === 13)
            saveWatchedButton();
    });
    gui.find('#monitor-close').click(toggleGui);
    $('.monitor-toggle').on('click', toggleGui);

    var focused = false;
    gui.on('mouseenter', function (e) {
        focused = true;
        // disable global page scroll
        var x = window.scrollX,
            y = window.scrollY;
        window.onscroll = function (e) {
            window.scrollTo(x, y);
        };
    });
    gui.on('mouseleave', function (e) {
        focused = false;
        // enable global page scroll
        window.onscroll = null;
    });

    $('body').on('keyup', function (e) {
        if (['SELECT', 'INPUT', 'TEXTAREA'].indexOf(e.target.tagName) > -1)
            return;

        // global

        switch (e.keyCode) {
            // 'm' - toggle gui
            case 77:
                toggleGui();
                break;
        }

        if (!focused)
            return

        // local

        switch (e.keyCode) {
            // 'escape' and 'q' - toggle gui
            case 27:
            case 81:
                toggleGui();
                break;
            // 'f' - filtered out mode
            case 70:
                $('#monitor').toggleClass('filtered-out');
                break;
        }
    });

    // info popup hover (post list tab)
    var shown_popup;
    var t; // timeout id
    gui.on('mouseenter', '.monitor-posts-list .item', function () {
        if (shown_popup)
            shown_popup.removeClass('shown');
        clearTimeout(t);
        var node = $(this);
        var popup = node.next();
        shown_popup = popup.addClass('shown');
        y_shift(popup, node);
    });
    gui.on('mouseleave', '.monitor-posts-list .item', function () {
        t = setTimeout(function () {
            shown_popup.removeClass('shown');
            shown_popup = null;
        }, 350);
    });
    gui.on('mouseenter', '.monitor-posts-list .info .inner', function () {
        clearTimeout(t);
    });
    gui.on('mouseleave', '.monitor-posts-list .info .inner', function () {
        t = setTimeout(function () {
            shown_popup.removeClass('shown');
            shown_popup = null;
        }, 350);
    });

    // info popup hover (file list tab)
    var shown_popup;
    var t_in; // timeout id (before shown)
    var t_out; // timeout id (before hidden)
    var t_show_loader; // timeout id (before show loader icon (yeah...))
    gui.on('mouseenter', '.monitor-files-list .post-link', function () {
        if (shown_popup)
            shown_popup.removeClass('shown');
        clearTimeout(t_show_loader);
        clearTimeout(t_in);
        clearTimeout(t_out);
        var node = $(this);
        var popup = node.parent().next().next();
        t_show_loader = setTimeout(function () {
            node.addClass('loading');
            t_in = setTimeout(function () {
                node.removeClass('loading');
                shown_popup = popup.addClass('shown');
                y_shift(popup, node);
            }, 400);
        }, 300);
    });
    gui.on('mouseleave', '.monitor-files-list .post-link', function () {
        clearTimeout(t_show_loader);
        clearTimeout(t_in);
        $(this).removeClass('loading');
        t_out = setTimeout(function () {
            shown_popup.removeClass('shown');
            shown_popup = null;
        }, 200);
    });
    gui.on('mouseenter', '.monitor-files-list .post-info .inner', function () {
        clearTimeout(t_out);
    });
    gui.on('mouseleave', '.monitor-files-list .post-info .inner', function () {
        t_out = setTimeout(function () {
            shown_popup.removeClass('shown');
            shown_popup = null;
        }, 200);
    });

    // y-position popup (target) closer to another element
    function y_shift(target, to) {
        var item = $(to);
        var item_rect = item[0].getBoundingClientRect();
        var inner = $(target).find('.inner');
        var inner_rect = inner[0].getBoundingClientRect();
        var inner_offset_top = inner[0].offsetTop;
        var monitor_rect = $('#monitor')[0].getBoundingClientRect();

        var distance = item_rect.top - inner_rect.top;
        var new_offset = inner_offset_top + distance;

        // centrize relative to the item
        new_offset -= (inner_rect.height - item_rect.height) / 2;

        // if gonna overflow parent
        var overflow = monitor_rect.height - (new_offset + inner_rect.height);
        // from bottom
        if (overflow < 0)
            new_offset += overflow;
        // from top
        else if (new_offset < 0)
            new_offset = 0;

        inner.css('top', new_offset + 'px');
    };

    // highlight files from the same post (files list)
    gui.on('mouseenter', '.monitor-files-list .item', function (e) {
        var id = this.dataset.post;
        var siblings = $(this).parents().eq(1).find('.item[data-post="' + id + '"]')
        if (siblings.length > 1)
            siblings.addClass('highlighted');
    });
    gui.on('mouseleave', '.monitor-files-list .item', function (e) {
        var id = this.dataset.post;
        $(this).parents().eq(1).find('.item[data-post="' + id + '"]').removeClass('highlighted');
    });
}

function loading (percent) {
    if (is_active_tab)
        send('loading', percent);

    var node = $('#monitor-loading');
    node.addClass('active').css('width', percent + '%');
    if (percent >= 99) { // "">= 99" - some bs with floating point division
        setTimeout(function () {
                node.removeClass('active');
                setTimeout(function () {
                    node.css('width', '0');
                }, 1500);
        }, 500);
    }
}

function toggleGui () {
    var gui = $('#monitor');

    gui.toggleClass('shown');

    if ($('.monitor-toggle').is('.bold')) {
        updatesHaveBeenSeen();
        send('seen_new');
    }
}

function updatesHaveBeenSeen () {
    $('.monitor-toggle').removeClass('bold');
    $('#monitor-new').removeClass('bold');

    if (is_active_tab) {
        markAllSeen();
        dumpStorage();
    }
}

function switchTab (e) {
    var tab_btn = $(this);

    // strip highlighting from "new" and mark new threads as seen
    if (tab_btn.is('#monitor-new')) {
        updatesHaveBeenSeen();
        send('seen_new');
    }

    if (tab_btn.hasClass('active'))
        return;

    $('#monitor .tab.active').removeClass('active');
    tab_btn.addClass('active');

    $('#monitor-listing').scrollTop(0);

    $('#monitor-listing div.active').removeClass('active');
    var tabname = tab_btn.data('tab');

    $('#monitor-listing > .monitor-' + tabname).addClass('active');
}

function saveWatchedButton (e) {
    var boardnames = $('#monitor-boards').val().split(' ');
    boardnames = boardnames.filter(function (name) {
        name = name.trim();
        if (name && existing_boards.indexOf(name) > -1) {
            return true;
        }
    });
    settings.boards = boardnames;

    if (is_active_tab) {
        setupBoards(settings.boards);
        dumpStorage();
        dumpSettings();
        updateBoards();
        updateView('watched lists');
    }
    else
        dumpSettings();
}

function saveGuiSettings() {
    var prev = $.extend({}, settings);

    settings.filters = $('#monitor-s-filters').val();
    settings.filter_files = $('#monitor-s-filter-files').prop('checked');

    filters = parseFilters(settings.filters);

    dumpSettings();

    if (is_active_tab) {
        if (settings.filters !== prev.filters || settings.filter_files != prev.filter_files)
            updateView('lists');
    }
}

function fillGuiSettings() {
    $('#monitor-s-filters').val(settings.filters);
    $('#monitor-s-filter-files').prop('checked', settings.filter_files);
}

function timeago (timestamp) {
    if (timestamp > Date.now()) // posts from the future - oooOOooOo
        return moment().fromNow();
    else
        return moment(timestamp).fromNow();
}

function sortByKey (array, key, reverse) {
    return array.sort(function (a, b) {
        return !reverse ? a[key] - b[key] : b[key] - a[key];
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
                return b_last - a_last;
            else
                return b_n - a_n;
        }
        else
            return b_last - a_last;
    });
}

function updateView (what, no_send) {
    if (is_active_tab && !no_send)
        send('update_view', what)

    log('update view (' + what + ')');

    // Watched Boards

    if (what.includes('watched'))
        $('#monitor-boards').val(settings.boards.join(' '));

    // Lists

    if (what.includes('lists'))
        updateLists();
}

function updateLists () {

    // grab all the stuff
    var all_posts = [], all_threads = [];
    for (var name in boards) {
        if (boards[name].hidden)
            continue;

        boards[name].threads.forEach(function (thread) {
            all_threads.push(thread);
            all_posts = all_posts.concat(thread.posts);
        });
    }

    // Posts

    var posts_by_date = sortByKey(all_posts, 'date'); // oldest to newest
    var items_by_date = posts_by_date;
    var items = [];
    var bad_items = [];
    for (var i = items_by_date.length - 1, n = list_limit; n >= 0 && i >= 0; i--) {
        var item = items_by_date[i];
        if (filterPass(item.thread.title)) {
            items.push(item);
            n--;
        }
        else
            bad_items.push(item);
    };
    $('.monitor-posts-list:not(.filtered-out)')[0].innerHTML = renderPostsList(items);
    $('.monitor-posts-list.filtered-out')[0].innerHTML = renderPostsList(bad_items);

    // New

    var items_by_date = sortByKey(all_threads, 'pseudo_cr_date'); // oldest to newest
    var items = [];
    var bad_items = [];
    for (var i = items_by_date.length - 1, n = list_limit; n >= 0 && i >= 0; i--) {
        var item = items_by_date[i];
        if (filterPass(item.title)) {

            if (item.new_) {
                // make main button bold
                $('.monitor-toggle').addClass('bold');
                // make tab button bold
                $('#monitor-new').addClass('bold');
            }

            items.push(item);
            n--;
        }
        else
            bad_items.push(item);
    };
    $('.monitor-new-list:not(.filtered-out)')[0].innerHTML = renderNewList(items);
    $('.monitor-new-list.filtered-out')[0].innerHTML = renderNewList(bad_items);

    // Active

    var items_by_date = sortByActivity(all_threads).reverse(); // least to most active
    var items = [];
    var bad_items = [];
    for (var i = items_by_date.length - 1, n = list_limit; n >= 0 && i >= 0; i--) {
        var item = items_by_date[i];
        if (filterPass(item.title)) {
            items.push(item);
            n--;
        }
        else
            bad_items.push(item);
    };
    $('.monitor-active-list:not(.filtered-out)')[0].innerHTML = renderActiveList(items);
    $('.monitor-active-list.filtered-out')[0].innerHTML = renderActiveList(bad_items);

    // Files

    updateFilesList(posts_by_date);
}

function renderPostsList (posts) {
    return posts.reduce(function (html, post) {
        var boardname = post.boardname;
        var href = '/' + boardname + '/res/' + post.thread.display_id + '.xhtml#i' + post.display_id;
        var title = post.message.trim();

        // strip spoilers from title
        title = title.replace(/%%(.{4,}?)%%/g, '').replace(/^%%\r?\n(.*((\r?\n.*)*))\r?\n%%(\r?\n)?/gm, '');
        // strip ^>DDDDD>>DDDD\n>>DDDDD\n... from title
        title = title.replace(/^(\s*>>(\/?\w+\/)?\d+\s*(\r?\n))+/, '');
        // strip quote from title
        title = title.replace(/^\s*>(.+)\r?\n/m, '');

        // if image only post put image url in the title
                      // aaaah! matches posts only containing ^>DDDDD>>DDDD\n>>DDDDD\n...
        if (!title || /^(\s*>>(\/?\w+\/)?\d+\s*(\r?\n)?)+/.test(title)) {
            if (post.files.length) {

                var m = post.files[0].src.split('/');
                title = m.slice(-3)[0] + '/' + m.slice(-1)[0];
            }
        }

        var thumbs_html = post.files.reduce(function (html, file) {
            var fname = file.src.split('/').slice(-1)[0];
            html += '<a href="/' + file.src + '"><img title="' + fname + '" src="/' + file.thumb + '"></a>';
            return html;
        }, '');

        return html + '<div class="item">' +
                        '<span class="boardname">' + boardname + '</span> — <a title="' + timeago(post.date) + '" href="' + href + '">' + post.thread.title + '</a><br>' +
                        '<span class="left-padding"><span class="boardname">' + boardname + '</span> </span>' +
                        '<span class="shortinfo">' + title + '</span>' +
                    '</div>' +
                    '<div class="info">' +
                        '<div class="reply postbody inner"><div class="color-lighter">' +
                            '<div class="thumbs-' + post.files.length + '">' +
                                thumbs_html +
                            '</div>' +
                            '<span class="message">' +
                                MarkParser.to_html(post.message, post.boardname) +
                            '</span>' +
                        '</div></div>' +
                    '</div>';
    }, '');
}

function renderNewList (threads) {
    return threads.reduce(function (html, thread) {

        var boardname = thread.posts[0].boardname;
        var href = '/' + boardname + '/res/' + thread.display_id + '.xhtml';
        var title = thread.title || ('>>' + thread.display_id);

        return html + '<div class="item' + (thread.new_ ? ' new' : '') + '">' +
                        '<span class="boardname">' + boardname + '</span> — <a href="' + href + '">' + title + '</a><br>' +
                        '<span class="left-padding"><span class="boardname">' + boardname + '</span> </span>' +
                            '<span title="активен ' + timeago(thread.last_hit) + '" class="shortinfo">(' + thread.posts_count + ')' + ' создан ' + timeago(thread.pseudo_cr_date) + '</span>' +
                    '</div>';
    }, '');
}

function renderActiveList (threads) {
    return threads.reduce(function (html, thread) {

        var boardname = thread.posts[0].boardname;
        var href = '/' + boardname + '/res/' + thread.display_id + '.xhtml';
        var title = thread.title || ('>>' + thread.display_id);
        var date = thread.posts[0].date;
        var time = '<time datetime="' + (new Date(date)).toISOString() + '">' + timeago(date) + '<time>';

        return html + '<div class="item' + (thread.new_ ? ' new' : '') + '">' +
                    '<span class="boardname">' + boardname + '</span> — <a href="' + href + '">' + title + '</a><br>' +
                    '<span class="left-padding"><span class="boardname">' + boardname + '</span> </span>' +
                        '<span class="shortinfo">(' + thread.posts_count + ')' + ' активен ' + timeago(thread.last_hit) +'</span>' +
                '</div>';
    }, '');
}

function updateFilesList (posts) {
    var ret = render(posts);
    var html = ret[0];
    var bad_posts = ret[1];
    var bad_html = render(bad_posts, true)[0];

    $('.monitor-files-list:not(.filtered-out)')[0].innerHTML = html;
    $('.monitor-files-list.filtered-out')[0].innerHTML = bad_html;

    // because files list height is dynamic
    // bad posts can only be filtered out during render
    // hence weird code flow

    function render(posts, no_filter) {
        var bad_posts = [];

        // columns of images
        var cols = [
            {i: 0, h: 0, html: ''},
            {i: 1, h: 0, html: ''},
            {i: 2, h: 0, html: ''},
            {i: 3, h: 0, html: ''},
        ];
        var max_height = 1000;

        // filled from cols as they exceed the max_height
        var cols_result = [];

        var n = 0;
        outer:
        for (var i = posts.length - 1; i >= 0; i--) {
            var post = posts[i];

            if (settings.filter_files && !no_filter && !filterPass(post.thread.title)) {
                bad_posts.push(post);
                continue;
            }

            if (!post.files.length)
                continue;

            var post_url = '/' + post.boardname + '/res/' + post.thread.display_id + '.xhtml#i' + post.display_id;

            // every file in post
            for (var j = post.files.length - 1; j >= 0; j--) {
                var file = post.files[j];

                var w = file.thumb_width;
                var h = file.thumb_height;

                var max_w = 88;
                if (w > max_w) {
                    mul = max_w/(w/100)*.01;
                    w = parseInt(w*mul);
                    h = parseInt(h*mul);
                }

                var col = n%cols.length;

                // post preview
                var thumbs_html = post.files.reduce(function (html, file) {
                    var fname = file.src.split('/').slice(-1)[0];
                    html += '<a href="/' + file.src + '"><img title="' + fname + '" src="/' + file.thumb + '"></a>';
                    return html;
                }, '');
                var post_info_html =
                        '<div class="post-info"><div class="reply postbody inner"><div class="color-lighter">' +
                            '<div class="thumbs-' + post.files.length + '">' +
                                thumbs_html +
                            '</div>' +
                            '<div class="meta reply">/' + post.boardname + '/ — ' + post.thread.title + '</div>' +
                            '<span class="message">' +
                                MarkParser.to_html(post.message, post.boardname) +
                            '</span>' +
                        '</div></div></div>';


                var fname = file.src.split('/').slice(-1)[0];
                var html =
                        '<div class="item reply" data-post="' + post.boardname + '-' + post.display_id + '">' +
                            '<a class="post-link" href="' + post_url + '">post</a>' +
                            '<a title="' + fname + '" href="/' + file.src + '">' +
                                '<img width="' + w + '" height="' + h + '" src="/' + file.thumb + '">' +
                            '</a>' +
                        '</div>' +
                        '<div class="info">'+
                            '<div class="reply postbody" style="width:' + file.thumb_width + 'px;"><div class="color-lighter">' +
                                '<img src="/' + file.thumb + '"><br>' +
                                timeago(post.date) + '<br>' +
                                '/' + post.boardname + '/ — ' + post.thread.title + '' +
                            '</div></div>' +
                        '</div>' +
                        post_info_html;

                cols[col].html += html;

                cols[col].h += h;
                if (cols[col].h >= max_height)
                    cols_result[cols[col].i] = cols.splice(col, 1)[0].html;

                n++;

                // break if no more rows to fill
                if (!cols.length)
                    break outer;
            }
        }

        // emit cols that didn't cross max_height (when there aren't enough posts)
        cols.forEach(function (col) {
            cols_result[col.i] = col.html;
        });

        var html = cols_result.reduce(function (html, inner) {
            return html + '<div>' + inner + '</div>';
        }, '');

        return [html, bad_posts];
    }
}

// Main ////////////////////////////////////////
////////////////////////////////////////////////

if (location.hash === '#redirect') {
    // redirect from json post to actual post page (part of MarkParser)
    var json_el = document.body.querySelector('*');
    var post = JSON.parse(json_el.innerHTML);
    var post_id = location.pathname.match(/(\d+)\.json$/)[1];
    location = '/' + post.board + '/res/' + post.threads[0].display_id + '.xhtml#i' + post_id;
    json_el.innerHTML = '<b>Redirecting...</b><br><br>';
}
else {
    loadSettings();
    filters = parseFilters(settings.filters);
    loadStorage();
    setupBoards(settings.boards);
    setupView();
    updateView('watched lists');

    var active_last_tick = parseInt(localStorage.getItem('monitor_active_tick') || 0);

    if (!activeTabExists() || (Date.now() - active_last_tick > tick_time * 3))
        startActive();
    else
        startSlave();
}
