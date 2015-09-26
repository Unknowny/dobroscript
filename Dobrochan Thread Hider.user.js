// ==UserScript==
// @name        Dobrochan Thread Hider
// @description Hide unwanted threads based on their title and message.
// @namespace   dc_hider
// @include     *dobrochan.*
// @version     2.2
// @grant       GM_setValue
// @grant       GM_getValue
// @require     https://ajax.googleapis.com/ajax/libs/jquery/2.1.3/jquery.min.js
// @homepage    https://github.com/Unknowny/dobroscript
// @downloadURL https://github.com/Unknowny/dobroscript/raw/master/Dobrochan Thread Hider.user.js
// @updateURL   https://github.com/Unknowny/dobroscript/raw/master/Dobrochan Thread Hider.user.js
// ==/UserScript==

if (!String.prototype.includes) {
    String.prototype.includes = function() {'use strict';
       return String.prototype.indexOf.apply(this, arguments) !== -1;
    };
}

function loadSettings () {
    var keep_title = GM_getValue('keep_title', true);
    var hider_text = GM_getValue('hider_text', '');
    var mods_rx = /(^[rib]{1,3}):(.*)/;
    var rules = [];
    hider_text.split('\n').forEach(function (line) {
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
                    in_body: mods.includes('b')
                }
            );
        }
    });

    return {rules: rules, keep_title: keep_title, hider_text: hider_text};
}

function setupSettings () {
    var help = 'злотред - ищет "ЗЛОТРЕД", "ЗлотреД"... в названии\nib:злотред - ищет "злотред" в названии и теле\nir:зл[Оо]тред - ищет "злотред" или "злОтред" в названии\n\nОдно правило на строку.\nМодификаторы правил:\n i - включить чувствительность к регистру\n     (отключено по умолчанию)\n b - искать также в теле поста\n r - регексп';
    var settings_node = $(
        '<table><hr><tbody>\
            <tr><td colspan="2" class="logo">Автоскрытие тредов</td></tr>\
            <tr>\
                <td class="postblock">Оставлять заголовок:</td>\
                <td><input id="keep_title" checked="' + s.keep_title + '" type="checkbox"></td>\
            </tr>\
            <tr><td colspan="2"><textarea id="hider_text" rows="7" cols="50">' + s.hider_text + '</textarea></td></tr>\
            <tr><td colspan="2"><pre>' + help + '</pre></td></tr>\
            <tr><td colspan="2" style="text-align:center"><button id="hider_save">Сохранить</button></td></tr>\
            <tr><td colspan="2" style="text-align:center; opacity:0" id="hider_ghost">Сохранил</td></tr>\
        </tbody></table>\
        ');
    settings_node.insertAfter('#js-form');
    $('#hider_save').click(function () {
        GM_setValue('keep_title', $('#keep_title')[0].checked);
        GM_setValue('hider_text', $('#hider_text').val());
        $('#hider_ghost').stop().css('opacity', 1).animate({'opacity': 0}, 1000);
    });
}

function hideThreads () {
    $('.oppost').each(function () {
        var thread_node = $(this).parent();
        var title = $('.replytitle', this).text();
        var message = $('.message', this).text();
        s.rules.forEach(function (rule) {
            if (rule.rx.test(title) || (rule.in_body && rule.rx.test(message)))
                hide(thread_node);
        });
    });
};

function hide (thread_node) {
    if (s.keep_title) {
        thread_node.css('opacity', '.33');
        thread_node.prev().prev('br').hide();
        thread_node.next('br').hide();
        thread_node.children().hide();
        thread_node.children().eq(0).show().find('br:first').hide().nextAll().hide();

        // "reshow" button
        if (!$('.reshow', thread_node).length) {
            var reshow = $('<a class="reshow">Показать</a>');
            reshow.click(function () {
                var node = $(this);
                if (node.text().includes('Показать')) {
                    show(thread_node);
                    node.text('Скрыть');
                }
                else {
                    hide(thread_node);
                    node.text('Показать');
                }
            });
            $('a.reply_ + a:first', thread_node)
                .after('<span> | </span>')
                .next()
                .after(reshow);
        }
    }
    else {
        thread_node.hide().nextUntil('*:not(hr, br)').hide();

        // api call
        var board = location.pathname.split('/')[1];
        var thread = thread_node.attr('id').substr(7);
        var endpoint = '/api/thread/' + board + '/' + thread + '/hide.json';
        $.get(endpoint).fail(function (xhr) {
            console.log('failed api call to ' + endpoint, xhr);
        });
    }
}

function show (thread_node) {
    thread_node.css('opacity', '1');
    thread_node.next('br').show();
    thread_node.children().show();
    thread_node.children().eq(0).find('br:first').show().nextAll().show();
}

// Main
var s = loadSettings();
if(/settings$/.test(location.pathname)) {
    setupSettings();
}
else if (!/\/res\/\d+\.xhtml$/.test(location.pathname)) {
    hideThreads();
}
