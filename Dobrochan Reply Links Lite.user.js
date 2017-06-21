// ==UserScript==
// @name        Dobrochan Reply Links Lite
// @description Show replies at the bottom of every post.
// @namespace   dc_replies_lite
// @include     *dobrochan.*
// @version     1.0.4
// @grant       none
// @homepage    https://github.com/Unknowny/dobroscript
// @updateURL   https://github.com/Unknowny/dobroscript/raw/master/Dobrochan Reply Links Lite.user.js
// @downloadURL https://github.com/Unknowny/dobroscript/raw/master/Dobrochan Reply Links Lite.user.js
// ==/UserScript==

ParseUrl = function (url) { // Hanabira's ParseUrl() is broken
    m = (url || document.location.href).match( /https?:\/\/([^\/]+)\/([^\/]+)\/((\d+)|res\/(\d+)|\w+)(\.x?html)?(#i?(\d+))?/)
    return m?{host:m[1], board:m[2], page:m[4], thread:m[5], pointer:m[8]}:{};
};
Hanabira.URL = ParseUrl();


$('.post[id^=post_] .postbody')
// filter out abbreviated posts bodies
.filter(function () {
    return !$(this).next().hasClass('alternate');
})
// find reflinks
.find('.message a').filter(function () {
    return /\>\>\d\d/.test( $(this).text() );
})
// attach to targets
.each(function () {
    var el = $(this),
        idTo = el.text().substr(2),
        idFrom = el.parents()[2].id.substr(5),
        href = el.attr('href');
    $('#post_' + idTo +  ' .abbrev').append('<a ' +
            'onclick="Highlight(event, '+idFrom+')" ' +
            'onmouseover="ShowRefPost(event, \''+ Hanabira.URL.board +'\', '+(Hanabira.URL.thread || idTo/*hack*/)+', '+idFrom+')" ' +
            'href="'+href+'" '+
            'style="font-size:70%;text-decoration:none;opacity:.8;font-style:italic;"'+
            '>&gt;&gt;'+idFrom+'</a> '
    );
});
