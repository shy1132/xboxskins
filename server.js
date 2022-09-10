//requires
const auth = require('./auth.json')
const express = require('express')
const fetch = require('node-fetch')
const jsdom = require("jsdom");
const fs = require('fs')
const octokit = new Octokit({ auth: auth.octokit });


//setups
const app = express()
const { JSDOM } = jsdom;
app.set('trust proxy', true);

//functions
function htmlEncode(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function updateindexes(){
    await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner: 'whakama',
        repo: 'xboxskins-archive',
        path: '/unleashx/'
    })
}


//code

app.get('/', (req, res) => {
    res.send('there is no interface for the site, only the api necessary for replacing the xbox-skins.net servers in UnleashX')
});

app.get('/rss/uxdash.php', (req, res) => {
    console.log('request made from '+req.headers['x-forwarded-for'])
    if(req.headers['x-forwarded-for'] !== '127.0.0.1'){
        return res.status(404).send('<rss></rss>')
    }

    var items = []

    fs.readdirSync('./skins/unleashx/')
    .forEach(file=>{
        items.push(`<item>\n<title>${htmlEncode(file.slice(0, -4))}</title>\n<author> </author>\n<link>${'http://archive.org/download/XBUXSkins/'+encodeURIComponent(file)}</link>\n<thumb>http://api.saws.land/xbox/thumb/${encodeURIComponent(file)}.jpg</thumb>\n</item>`)
    })

    var xml = `<?xml version='1.0'?>\n\n<!DOCTYPE rss PUBLIC "-//Netscape Communications//DTD RSS 0.91//E" "http://my.netscape.com/publish/formats/rss-0.91.dtd">\n\n<rss version="0.91">\n<channel>\n<title>UnleashX xbox-skins.net archive</title>\n<link>http://xbox-skins.net</link>\n<description>https://archive.org/details/XBUXSkins converted into RSS</description>\n<language>en-us</language>\n${items.join('\n')}</channel>\n</rss>`
        
    res.contentType('text/xml')
    res.send(xml)
})

app.get('/rss/uxdash.php/:skin.jpg', (req, res) => {
    console.log('request made from '+req.headers['x-forwarded-for'])
    if(req.headers['x-forwarded-for'] !== '127.0.0.1'){
        return res.status(404).send('<rss></rss>')
    }

    const zip = new StreamZip({
        file: './skins/unleashx/'+decodeURIComponent(req.params.skin),
        storeEntries: true
    });

    zip.on('ready', () => {
        console.log(...zip.entries())
        zip.close()
    });

    res.status(404).send('')
})


app.listen(143, () => {
    console.log("listening on port 143");
})