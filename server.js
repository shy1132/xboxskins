//requires
const express = require('express')
const fetch = require('node-fetch')
const jsdom = require("jsdom");
const fs = require('fs')


//setups
const app = express()
const { JSDOM } = jsdom;
app.set('trust proxy', true);


//code

app.get('/', (req, res) => {
    res.send('there is no interface for the site, only the api necessary for replacing the xbox-skins.net servers in UnleashX')
});

app.get('/rss/uxdash.php', (req, res) => {
    console.log('request made from '+req.headers['x-forwarded-for'])
    if(req.headers['x-forwarded-for'] !== '127.0.0.1'){
        return res.status(404).send('<rss></rss>')
    }
    fetch('https://archive.org/download/XBUXSkins')
    .then(res=>res.text())
    .then(data=>{
        const dom = new JSDOM(data);
        const table = dom.window.document.getElementsByClassName('directory-listing-table')[0].children[1]

        var items = ``
        for (let i = 1; i < table.children.length; i++) {
            var item = table.children[i].children[0].children[0]
            items += `<item>\n<title>${item.textContent.slice(0, -4).replace('&', '&amp;')}</title>\n<author> </author>\n<link>${'http://archive.org/download/XBUXSkins/'+item.href}</link>\n<thumb>http://api.saws.land/xbox/thumb/${item.href}.jpg</thumb>\n</item>`
        }

        var xml = `<?xml version='1.0'?>\n\n<!DOCTYPE rss PUBLIC "-//Netscape Communications//DTD RSS 0.91//E" "http://my.netscape.com/publish/formats/rss-0.91.dtd">\n\n<rss version="0.91">\n<channel>\n<title>UnleashX replacement server</title>\n<link>http://xbox-skins.net</link>\n<description>archive.org UnleashX skins</description>\n<language>en-us</language>\n${items}\n</channel>\n</rss>`
        
        res.contentType('text/xml')
        res.send(xml)
    })
})


app.listen(143, () => {
    console.log("listening on port 143");
})