process.on('uncaughtException', function(exception) {
    console.log(exception.stack)
});

//requires
const auth = require('./auth.json')
const express = require('express')
//const fetch = require('node-fetch')
//const jsdom = require('jsdom')
//const fs = require('fs')
const request = require('request')
const AdmZip = require('adm-zip')
const { Octokit } = require('octokit')
const tiddb = require('./files/tiddb.json')


//setups
const octokit = new Octokit({ auth: auth.octokit });
const app = express()
//const { JSDOM } = jsdom;
app.set('trust proxy', true);
app.use(express.static('public'));
app.disable('x-powered-by');

//variables
var skindex = {
    'unleashx': []
}

var prindex = {
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

function parseUa(header){
    if(header && header.startsWith('Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1')) {
        return true
    } else return header
}

async function updatePreviewIndexes(){
    console.log('updating preview indexes')
    prindex.unleashx = []
    //console.log('fetching tree sha')
    var rootsha = await (await octokit.request('HEAD /repos/whakama/xbox-previews-archive/contents/')).headers.etag.split('W/"')[1].split('"')[0]
    await octokit.request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
        owner: 'whakama',
        repo: 'xbox-previews-archive',
        tree_sha: rootsha
    }).then(res=>{
        //console.log('files fetched')
        for (let i = 0; i < res.data.tree.length; i++) {
            var wmv = res.data.tree[i].path.split('/').pop()
            prindex.unleashx.push(wmv)
        }
        console.log('finished updating preview indexes')
    })
}

async function updateSkinIndexes(){
    console.log('updating skin indexes')
    skindex.unleashx = []
    //console.log('fetching tree sha')
    var rootsha = await (await octokit.request('HEAD /repos/whakama/xboxskins-archive/contents/')).headers.etag.split('W/"')[1].split('"')[0]
    //console.log('root sha obtained ['+rootsha+']')
    //console.log('fetching unleashx tree sha')
    var unsha;
    await octokit.request('GET /repos/whakama/xboxskins-archive/git/trees/'+rootsha).then(res=>{
        for (let i = 0; i < res.data.tree.length; i++) {
            if(res.data.tree[i].path === 'unleashx'){
                return unsha = res.data.tree[i].sha
            }
        }
    })
    //console.log('unleashx sha obtained ['+unsha+']')
    //console.log('fetching files')
    await octokit.request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
        owner: 'whakama',
        repo: 'xboxskins-archive',
        tree_sha: unsha
    }).then(res=>{
        //console.log('files fetched')
        for (let i = 0; i < res.data.tree.length; i++) {
            var name = res.data.tree[i].path.split('/').pop()
            skindex.unleashx.push({name, download: `https://raw.githubusercontent.com/whakama/xboxskins-archive/main/unleashx/${encodeURIComponent(name)}`, id: i})
        }
        console.log('finished updating skin indexes')
    })
}

updateSkinIndexes()
updatePreviewIndexes()
setInterval(updateSkinIndexes, 21600000)
setInterval(updatePreviewIndexes, 21600000)


//code
//skin downloader
app.get('/rss/uxdash.php', async (req, res) => { //this has nothing to do with php but the original website used php
    console.log({
        req: 'ux_srss',
        ip: parseForwarded(req.headers['x-forwarded-for']),
        time: Date.now(),
        xbox: parseUa(req.headers['user-agent'])
    })

    var items = [
        uxEntry('! unofficial UnleashX skin server (sorted from archive.org/details/XBUXSkins)', 'http://www.xbox-skins.net/404/this_is_not_a_skin', 'http://www.xbox-skins.net/thumb.jpg'),
        uxEntry('!! see www.xbox-skins.net in your browser for more information', 'http://www.xbox-skins.net/404/this_is_not_a_skin', 'http://www.xbox-skins.net/thumb.jpg'),
        uxEntry('!!! ------------------------------------------------------------------------------------------- !!!', 'http://www.xbox-skins.net/404/this_is_not_a_skin', 'http://www.xbox-skins.net/thumb.jpg')
    ]
    var nsfwitems = []

    for (let i = 0; i < skindex.unleashx.length; i++) {
        var file = skindex.unleashx[i]
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
        req: 'ux_sdl',
        ip: parseForwarded(req.headers['x-forwarded-for']),
        time: Date.now(),
        xbox: parseUa(req.headers['user-agent'])
    })

    if (!req.params.skin) return res.status(404).send('')

    const id = parseInt(req.params.skin)
    if (id > skindex.unleashx.length - 1 || id < 0 || isNaN(id)) return res.status(404).send('')

    request({
            url: skindex.unleashx[id].download,
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
        req: 'ux_simg',
        ip: parseForwarded(req.headers['x-forwarded-for']),
        time: Date.now(),
        xbox: parseUa(req.headers['user-agent'])
    })

    if (!req.params.skin) return res.status(404).send('')

    const id = parseInt(req.params.skin)
    if (id > skindex.unleashx.length - 1 || id < 0 || isNaN(id)) return res.status(404).send('')

    request({
            url: skindex.unleashx[id].download,
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

//preview downloader
app.get('/games/xml/:titleid.xml', async (req, res) => {
    //console.log(req.url)
    console.log({
        req: 'ux_ptid',
        ip: parseForwarded(req.headers['x-forwarded-for']),
        time: Date.now(),
        xbox: parseUa(req.headers['user-agent'])
    })

    var titleid = encodeURIComponent(req.params.titleid.toUpperCase())
    if(titleid.length != 8) return res.status(200).send(''); //200 on these because instead of requesting it to be added itll just say it doesnt exist
    if(isNaN(parseInt(titleid, 16))) return res.status(200).send('');
    if(!tiddb[titleid]) return res.status(200).send('');
    var info = tiddb[titleid]

    var vidid = 0

    for(let i = 0; i < prindex.unleashx.length; i++) {
        if(prindex.unleashx[i].toLowerCase().replace(/[^\w\s]/gi, '').replace(/\s+/g, ' ').trim().slice(0, -3) === info.title.toLowerCase().replace(/[^\w\s]/gi, '').replace(/\s+/g, ' ').trim()){
            vidid = i+1
        }
    }

    res.contentType('text/xml')
    //res.send(`<gdbase><xbg title="${info.title}" decid="${parseInt(titleid, 16)}" hexid="${titleid}" cover="0" thumb="0" md5="" size="" liveenabled="0" systemlink="0" patchtype="0" players="0" customsoundtracks="0" genre="" esrb="" publisher="" developer="" region="0" rc="0" video="1" vc="0" vidid="${vidid}"/></gdbase>`)
    res.send(`<gdbase><xbg title="${info.title}" decid="${parseInt(titleid, 16)}" hexid="${titleid}" video="${0-(vidid>0)}" vidid="${vidid}"/></gdbase>`)
})

app.get('/games/sendvid.php', async (req, res) => {
    //console.log(req.url);
    console.log({
        req: 'ux_pvid',
        ip: parseForwarded(req.headers['x-forwarded-for']),
        time: Date.now(),
        xbox: parseUa(req.headers['user-agent'])
    })
    
    if(parseUa(req.headers['user-agent']) === undefined) return res.redirect(req.url)

    var sid = parseInt(req.query.sid)-1
    if(isNaN(sid)) return res.status(404).send('')
    if(!prindex.unleashx[sid]) return res.status(404).send('')
    
    request({
            url: `https://raw.githubusercontent.com/whakama/xbox-previews-archive/main/${encodeURIComponent(prindex.unleashx[sid])}`,
            encoding: null
        },
        (err, resp, buffer) => {
            if (!err && resp.statusCode === 200) {
                //console.log('sending')
                res.send(buffer)
                return;
            } else {
                //console.log('404')
                res.status(404).send('')
                return;
            }
        })
})


//misc
app.get('/404/:message', (req, res) => { //unleashx will output :message due to it being the text after the last slash
    res.status(404).send('')
})

app.all('*', (req, res) => { //since its after everything it just 404s shit that isnt in this file/public dir
    res.status(404).send('')
});


app.listen(745, () => {
    console.log("listening on port 745");
})

console.log('starting')