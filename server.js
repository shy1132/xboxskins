process.on('uncaughtException', function(exception) {
    console.log(exception.stack)
});
//requires
const auth = require('./auth.json')
const express = require('express')
const fetch = require('node-fetch')
const jsdom = require("jsdom");
const fs = require('fs')
const request = require('request')
const AdmZip = require("adm-zip");
const { Octokit } = require('octokit')
const octokit = new Octokit({ auth: auth.octokit });


//setups
const app = express()
const { JSDOM } = jsdom;
app.set('trust proxy', true);
app.disable('x-powered-by');

//variables
var index = {
    'unleashx': []
}

//functions
function htmlEncode(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function updateIndexes(){
    console.log('updating indexes')
    await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner: 'whakama',
        repo: 'xboxskins-archive',
        path: '/unleashx'
    }).then(res=>{
        for (let i = 0; i < res.data.length; i++) {
            index.unleashx.push({name: res.data[i].name, download: res.data[i].download_url, id: i})
        }
        console.log('finished updating indexes')
    })
}

updateIndexes()
setInterval(updateIndexes, 21600000)


//code

app.get('/', (req, res) => {
    res.contentType('text/html')
    res.send(fs.readFileSync('./public/index.html'))
});

app.get('/rss/uxdash.php', (req, res) => {
    console.log({
        req: 'ux_rss',
        ip: req.headers['x-forwarded-for'],
        time: Date.now(),
        xbox: req.headers['user-agent']==='Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)' ? true : req.headers['user-agent']
    })

    var items = [`<item>\n<title>!! unofficial UnleashX skin servers (from archive.org/details/XBUXSkins)</title>\n<author> </author>\n<link>http://xbox-skins.net/404/this_is_not_a_skin</link>\n<thumb>http://www.xbox-skins.net/thumb.jpg</thumb>\n</item>`, `<item>\n<title>!!! be warned, there are some NSFW skins</title>\n<author> </author>\n<link>http://xbox-skins.net/404/this_is_not_a_skin</link>\n<thumb>http://www.xbox-skins.net/thumb.jpg</thumb>\n</item>`]

    for (let i = 0; i < index.unleashx.length; i++) {
        var file = index.unleashx[i]
        items.push(`<item>\n<title>${htmlEncode(file.name.slice(0, -4))}</title>\n<author> </author>\n<link>http://xbox-skins.net/rss/uxdash.php/download/${file.id}.zip</link>\n<thumb>http://www.xbox-skins.net/rss/uxdash.php/thumb/${encodeURIComponent(file.id)}.jpg</thumb>\n</item>`)
    }

    var xml = `<?xml version='1.0'?>\n\n<!DOCTYPE rss PUBLIC "-//Netscape Communications//DTD RSS 0.91//E" "http://my.netscape.com/publish/formats/rss-0.91.dtd">\n\n<rss version="0.91">\n<channel>\n<title>UnleashX xbox-skins.net archive</title>\n<link>http://xbox-skins.net</link>\n<description></description>\n<language>en-us</language>\n${items.join('\n')}</channel>\n</rss>`

    res.contentType('text/xml')
    res.send(xml)
})

app.get('/rss/uxdash.php/download/:skin.zip', async (req, res) => {
    console.log({
        req: 'ux_dl',
        ip: req.headers['x-forwarded-for'],
        time: Date.now(),
        xbox: req.headers['user-agent']==='Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)' ? true : req.headers['user-agent']
    })

    if (!req.params.skin) return res.status(404).send('')

    const id = parseInt(req.params.skin)
    if (id > index.unleashx.length - 1 || id < 0 || isNaN(id)) return res.status(404).send('')

    request({
            url: index.unleashx[id].download,
            encoding: null
        },
        (err, resp, buffer) => {
            if (!err && resp.statusCode === 200) {
                res.contentType('application/zip');
                return res.send(resp.body);
            } else {
                return res.status(404).send('')
            }
        });
})

app.get('/rss/uxdash.php/thumb/:skin.jpg', async (req, res) => {
    console.log({
        req: 'ux_img',
        ip: req.headers['x-forwarded-for'],
        time: Date.now(),
        xbox: req.headers['user-agent'] === 'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)' ? true : req.headers['user-agent']
    })

    if (!req.params.skin) return res.status(404).send('')

    const id = parseInt(req.params.skin)
    if (id > index.unleashx.length - 1 || id < 0 || isNaN(id)) return res.status(404).send('')

    request({
            url: index.unleashx[id].download,
            encoding: null
        },
        (err, resp, buffer) => {
            if (!err && resp.statusCode === 200) {
                var zip = new AdmZip(buffer);
                var zipfiles = zip.getEntries()
                for (let i = 0; i < Object.values(zipfiles).length; i++) {
                    const entry = Object.values(zipfiles)[i]
                    if (entry.entryName.endsWith('jpg') || entry.entryName.endsWith('jpeg')) {
                        res.contentType('image/jpeg')
                        res.send(entry.getData())
                        break;
                    } else if (i >= Object.values(zipfiles).length - 1) {
                        res.status(200).send('')
                        break;
                    }
                }
            } else {
                return res.status(200).send('')
            }
        });
})

app.get('/404/:message', async (req, res) => { //unleashx will output :message due to it being the text after the last slash
    res.status(404).send('')
})

app.get('/thumb.jpg', async (req, res) => {
    res.contentType('image/jpeg')
    res.send(fs.readFileSync('./assets/thumb.jpg'))
})

//404 handler
app.get('*', function(req, res){
    res.status(404).send('not found');
});


app.listen(745, () => {
    console.log("listening on port 745");
})

console.log('starting')