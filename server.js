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
const JSZip = require("jszip");
const { Octokit } = require('octokit')
const octokit = new Octokit({ auth: auth.octokit });


//setups
const app = express()
const { JSDOM } = jsdom;
app.set('trust proxy', true);

//variables
var index = {
    'unleashx': []
}

//functions
function htmlEncode(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function updateIndexes(){
    await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner: 'whakama',
        repo: 'xboxskins-archive',
        path: '/unleashx'
    }).then(res=>{
        for (let i = 0; i < res.data.length; i++) {
            index.unleashx.push({name: res.data[i].name, download: res.data[i].download_url, id: i})
        }
    })
}

updateIndexes()


//code

app.get('/', (req, res) => {
    res.send('there is no interface for the site, only the api necessary for replacing the xbox-skins.net servers in UnleashX<br><br>-shy')
});

app.get('/rss/uxdash.php', (req, res) => {
    console.log('request made from '+req.headers['x-forwarded-for'])
    if(req.headers['x-forwarded-for'] !== '127.0.0.1'){
        return res.status(404).send('')
    }

    var items = []

    for (let i = 0; i < index.unleashx.length; i++) {
        var file = index.unleashx[i]
        items.push(`<item>\n<title>${htmlEncode(file.name.slice(0, -4))}</title>\n<author> </author>\n<link>http://xbox-skins.net/rss/uxdash.php/download/${file.id}.zip</link>\n<thumb>http://www.xbox-skins.net/rss/uxdash.php/thumb/${encodeURIComponent(file.id)}.jpg</thumb>\n</item>`)
    }

    var xml = `<?xml version='1.0'?>\n\n<!DOCTYPE rss PUBLIC "-//Netscape Communications//DTD RSS 0.91//E" "http://my.netscape.com/publish/formats/rss-0.91.dtd">\n\n<rss version="0.91">\n<channel>\n<title>UnleashX xbox-skins.net archive</title>\n<link>http://xbox-skins.net</link>\n<description>https://archive.org/details/XBUXSkins converted into RSS</description>\n<language>en-us</language>\n${items.join('\n')}</channel>\n</rss>`

    res.contentType('text/xml')
    res.send(xml)
})

app.get('/rss/uxdash.php/download/:skin.zip', async (req, res) => {
    console.log('request made from ' + req.headers['x-forwarded-for'])
    if (req.headers['x-forwarded-for'] !== '127.0.0.1') {
        return res.status(404).send('')
    }
    if (!req.params.skin) return res.status(404).send('')

    const id = parseInt(req.params.skin)
    if (id > index.unleashx.length - 1 || id < 0) return res.status(404).send('')

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
    console.log('request made from ' + req.headers['x-forwarded-for'])
    if (req.headers['x-forwarded-for'] !== '127.0.0.1') {
        return res.status(404).send('')
    }
    if (!req.params.skin) return res.status(404).send('')

    const id = parseInt(req.params.skin)
    if (id > index.unleashx.length - 1 || id < 0 || isNaN(id)) return res.status(404).send('')

    request({
            url: index.unleashx[id].download,
            encoding: null
        },
        (err, resp, buffer) => {
            if (!err && resp.statusCode === 200) {
                    JSZip.loadAsync(buffer).then(function (zip) {
                        for (let i = 0; i < Object.values(zip.files).length; i++) {
                            const entry = Object.values(zip.files)[i]
                            if(entry.name.endsWith('jpg') || entry.name.endsWith('jpeg')){
                                zip.file(entry.name).async('nodebuffer').then(data=>{
                                    res.contentType('image/jpeg')
                                    res.send(data)
                                })
                                break;
                            } else if(i >= Object.values(zip.files).length-1){
                                res.contentType("image/jpeg");
                                res.send(fs.readFileSync('./assets/thumb.jpg'))
                                break;
                            }
                        }
            
                    });
            } else {
                return res.status(404).send('')
            }
        });
})


app.listen(143, () => {
    console.log("listening on port 143");
})