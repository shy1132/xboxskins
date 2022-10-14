process.on('uncaughtException', function(exception) {
    console.log(exception.stack)
});
//requires
const auth = require('./auth.json')
const express = require('express')
//const fetch = require('node-fetch')
//const jsdom = require("jsdom");
const fs = require('fs')
const request = require('request')
const AdmZip = require("adm-zip");
const { Octokit } = require('octokit')
const octokit = new Octokit({ auth: auth.octokit });


//setups
const app = express()
//const { JSDOM } = jsdom;
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

function uxEntry(title, link, thumb){
    return `<item><title>${title}</title><link>${link}</link><thumb>${thumb}</thumb></item>`
}

function parseForwarded(header){
    if(header && header.split(',')[header.split(',').length-1]) {
        return header.split(',')[header.split(',').length-1].trim()
    } else return null
}

async function updateIndexes(){
    console.log('updating indexes')
    index.unleashx = []
    console.log('fetching tree sha')
    var rootsha;
    await octokit.request('HEAD /repos/whakama/xboxskins-archive/contents/').then(res=>{return rootsha = res.headers.etag.split('W/"')[1].split('"')[0]})
    console.log('root sha obtained ['+rootsha+']')
    console.log('fetching unleashx tree sha')
    var unsha;
    await octokit.request('GET /repos/whakama/xboxskins-archive/git/trees/'+rootsha).then(res=>{
        for (let i = 0; i < res.data.tree.length; i++) {
            if(res.data.tree[i].path === 'unleashx'){
                return unsha = res.data.tree[i].sha
            }
        }
    })
    console.log('unleashx sha obtained ['+unsha+']')
    console.log('fetching files')
    await octokit.request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
        owner: 'whakama',
        repo: 'xboxskins-archive',
        tree_sha: unsha
    }).then(res=>{
        console.log('files fetched')
        for (let i = 0; i < res.data.tree.length; i++) {
            var name = res.data.tree[i].path.split('/').pop()
            index.unleashx.push({name, download: `https://raw.githubusercontent.com/whakama/xboxskins-archive/main/unleashx/${encodeURIComponent(name)}`, id: i})
        }
        console.log('finished updating indexes')
    })
}

updateIndexes()
setInterval(updateIndexes, 21600000)


//code
app.use(express.static('public'))

app.get('/rss/uxdash.php', (req, res) => {
    console.log({
        req: 'ux_rss',
        ip: parseForwarded(req.headers['x-forwarded-for']),
        time: Date.now(),
        xbox: req.headers['user-agent'].startsWith('Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1') ? true : req.headers['user-agent']
    })

    var items = [
        uxEntry('! unofficial UnleashX skin server (sorted from archive.org/details/XBUXSkins)', 'http://www.xbox-skins.net/404/this_is_not_a_skin', 'http://www.xbox-skins.net/thumb.jpg'),
        uxEntry('!! all NSFW skins at bottom', 'http://www.xbox-skins.net/404/this_is_not_a_skin', 'http://www.xbox-skins.net/thumb.jpg'),
        uxEntry('!!! ------------------------------------------------------------------------------------------- !!!', 'http://www.xbox-skins.net/404/this_is_not_a_skin', 'http://www.xbox-skins.net/thumb.jpg')
    ]
    var nsfwitems = []

    for (let i = 0; i < index.unleashx.length; i++) {
        var file = index.unleashx[i]
        if(file.name.includes('[NSFW]')) {
            nsfwitems.push(uxEntry(`~${htmlEncode(file.name.slice(0, -4))}`, `http://www.xbox-skins.net/uxdash/download/${file.id}.zip`, `http://www.xbox-skins.net/uxdash/thumb/${encodeURIComponent(file.id)}.jpg`))
        } else {
            items.push(uxEntry(`${htmlEncode(file.name.slice(0, -4))}`, `http://www.xbox-skins.net/uxdash/download/${file.id}.zip`, `http://www.xbox-skins.net/uxdash/thumb/${encodeURIComponent(file.id)}.jpg`))
        }
    }
    items = items.concat(nsfwitems)

    var xml = `<?xml version='1.0'?><!DOCTYPE rss PUBLIC "-//Netscape Communications//DTD RSS 0.91//E" "http://my.netscape.com/publish/formats/rss-0.91.dtd"><rss version="0.91"><channel><title>www.xbox-skins.net replacement server</title><link>http://www.xbox-skins.net</link><language>en-us</language>${items.join('')}</channel></rss>`
    res.contentType('text/xml')
    res.send(xml)
})

app.get('/uxdash/download/:skin.zip', async (req, res) => {
    console.log({
        req: 'ux_dl',
        ip: parseForwarded(req.headers['x-forwarded-for']),
        time: Date.now(),
        xbox: req.headers['user-agent'].startsWith('Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1') ? true : req.headers['user-agent']
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
                res.send(resp.body);
            } else {
                res.status(404).send('')
            }
        });
})

app.get('/uxdash/thumb/:skin.jpg', async (req, res) => {
    console.log({
        req: 'ux_img',
        ip: parseForwarded(req.headers['x-forwarded-for']),
        time: Date.now(),
        xbox: req.headers['user-agent'].startsWith('Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1') ? true : req.headers['user-agent']
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
                var valid = ['png', 'jpg', 'jpeg', 'bmp']
                var convalid = ['jpg', 'jpeg']
                var contenders = []

                for (let i = 0; i < Object.values(zipfiles).length; i++) {
                    const entry = Object.values(zipfiles)[i]
                    const ename = entry.entryName.toLowerCase().split('/')[entry.entryName.toLowerCase().split('/').length-1]
                    //console.log(ename)
                    if((ename.startsWith('preview') || ename.startsWith('screenshot')) && valid.includes(ename.split('.')[ename.split('.').length-1])){
                        //console.log('1')
                        res.contentType('image/'+ename.split('.')[ename.split('.').length-1])
                        res.send(entry.getData())
                        break;
                    } else if(convalid.includes(ename.split('.')[ename.split('.').length-1])){
                        //console.log('2')
                        contenders.push(entry)
                    }

                    if(i >= Object.values(zipfiles).length-1 && contenders.length > 0){
                        //console.log('3')
                        //console.log(contenders[0].entryName)
                        var conename = contenders[0].entryName.toLowerCase().split('/')[contenders[0].entryName.toLowerCase().split('/').length-1]
                        res.contentType('image/'+conename.split('.')[conename.split('.').length-1])
                        res.send(contenders[0].getData())
                        break;
                    } else if(i >= Object.values(zipfiles).length-1){
                        //console.log('4')
                        res.status(200).send('')
                        break;
                    }
                }
            } else {
                res.status(200).send('')
            }
        });
})

app.get('/404/:message', async (req, res) => { //unleashx will output :message due to it being the text after the last slash
    res.status(404).send('')
})

//404 handler
app.get('*', function(req, res){
    res.status(404).send('')
});


app.listen(745, () => {
    console.log("listening on port 745");
})

console.log('starting')