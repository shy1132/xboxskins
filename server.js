process.on('uncaughtException', function(exception) {
    console.log(exception.stack)
})

//requires
const express = require('express')
const AdmZip = require('adm-zip')
const { Octokit } = require('octokit')
const auth = require('./auth.json')
const titleIds = require('./files/titleIds.json')

//setups
const octokit = new Octokit({
    auth: auth.octokit
})

const app = express()

app.set('trust proxy', true)
app.use(express.static('public'))
app.disable('x-powered-by')

//variables
var skinIndex = []
var previewIndex = []
var skinCache = {}

//functions
function htmlEncode(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function uxEntry(title, link, thumb) {
    return `<item><title>${title}</title><link>${link}</link><thumb>${thumb}</thumb></item>`;
}

function parseForwarded(header) {
    if (header && header.split(',')[header.split(',').length - 1]) {
        return header.split(',')[header.split(',').length - 1].trim();
    } else return null;
}

function parseUa(header) {
    if (header && header.startsWith('Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1')) {
        return true;
    } else return header;
}

async function updateSkinIndexes() {
    console.log('updating skin indexes')
    skinIndex = []

    var rootHash = (await octokit.request('HEAD /repos/whakama/xbox-skins-archive/contents/')).headers.etag.split('W/"')[1].split('"')[0]
    var treeHash;
    await octokit.request('GET /repos/whakama/xbox-skins-archive/git/trees/' + rootHash).then(res => {
        for (let i = 0; i < res.data.tree.length; i++) {
            if (res.data.tree[i].path === 'unleashx') {
                return treeHash = res.data.tree[i].sha
            }
        }
    })

    var files = await octokit.request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
        owner: 'whakama',
        repo: 'xbox-skins-archive',
        tree_sha: treeHash
    })

    for (let i = 0; i < files.data.tree.length; i++) {
        let name = files.data.tree[i].path.split('/').pop()
        skinIndex.push({
            name,
            download: `https://raw.githubusercontent.com/whakama/xbox-skins-archive/main/unleashx/${encodeURIComponent(name)}`,
            id: i
        })
    }

    console.log('finished updating skin indexes')
}

async function updatePreviewIndexes() {
    console.log('updating preview indexes')
    previewIndex = []

    var rootHash = (await octokit.request('HEAD /repos/whakama/xbox-previews-archive/contents/')).headers.etag.split('W/"')[1].split('"')[0]
    var files = await octokit.request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
        owner: 'whakama',
        repo: 'xbox-previews-archive',
        tree_sha: rootHash
    })

    for (let i = 0; i < files.data.tree.length; i++) {
        let wmvFile = files.data.tree[i].path.split('/').pop()
        previewIndex.push(wmvFile)
    }

    console.log('finished updating preview indexes')
}

function clearSkinCache() {
    var expiryDeadline = Date.now()
    var skinsCleared = 0

    var skinCacheArr = Object.keys(skinCache)
    if(skinCacheArr.length > 10) {
        skinsCleared = skinCacheArr.length
        skinCache = {}; //prevent memory leak by someone who may decide to try it
        skinCacheArr = [];
    }

    for (let i = 0; i < skinCacheArr.length; i++) {
        var entry = skinCache[skinCacheArr[i]]
        if(expiryDeadline > entry.expires) {
            delete skinCache[skinCacheArr[i]];
            skinsCleared++;
        }
    }
    
    if(skinsCleared > 0) console.log(`cleared cache for ${skinsCleared} skins`)
}

updateSkinIndexes()
updatePreviewIndexes()
setInterval(updateSkinIndexes, 21600000)
setInterval(updatePreviewIndexes, 21600000)
setInterval(clearSkinCache, 60000) //just checks every minute to see if any cache needs to be cleared

//code
//skin downloader
app.get('/rss/uxdash.php', async (req, res) => { //sends a giant xml of all the skins in the db (this has nothing to do with php but the original website used php)
    console.log({
        req: 'ux_srss',
        ip: parseForwarded(req.headers['x-forwarded-for']),
        time: Date.now(),
        xbox: parseUa(req.headers['user-agent'])
    })

    var items = [ //this will always show at the top, so i put some information here for anyone confused (since its just a giant list of skins)
        uxEntry('! unofficial UnleashX skin downloader', 'http://www.xbox-skins.net/404/this_is_not_a_skin', 'http://www.xbox-skins.net/thumb.jpg'),
        uxEntry('!! see www.xbox-skins.net in your browser for more information', 'http://www.xbox-skins.net/404/this_is_not_a_skin', 'http://www.xbox-skins.net/thumb.jpg'),
        uxEntry('!!! ------------------------------------------------------------------------------------------- !!!', 'http://www.xbox-skins.net/404/this_is_not_a_skin', 'http://www.xbox-skins.net/thumb.jpg')
    ]
    var nsfwItems = []

    for (let i = 0; i < skinIndex.length; i++) {
        var file = skinIndex[i]
        if (file.name.includes('[NSFW]')) {
            nsfwItems.push(uxEntry(`~${htmlEncode(file.name.slice(0, -4))}`, `http://www.xbox-skins.net/downloads/skins/${file.id}.zip`, `http://www.xbox-skins.net/downloads/thumbs/${encodeURIComponent(file.id)}`))
        } else {
            items.push(uxEntry(`${htmlEncode(file.name.slice(0, -4))}`, `http://www.xbox-skins.net/downloads/skins/${file.id}.zip`, `http://www.xbox-skins.net/downloads/thumbs/${encodeURIComponent(file.id)}`))
        }
    }
    items = items.concat(nsfwItems)

    var xml = `<?xml version='1.0'?><!DOCTYPE rss PUBLIC "-//Netscape Communications//DTD RSS 0.91//E" "http://my.netscape.com/publish/formats/rss-0.91.dtd"><rss version="0.91"><channel><title>www.xbox-skins.net replacement server</title><link>http://www.xbox-skins.net</link><language>en-us</language>${items.join('')}</channel></rss>`
    res.contentType('text/xml')
    res.send(xml)
})

app.get('/downloads/skins/:skin.zip', async (req, res) => { //sends the zip file for a skin by it's id (obtained from the index of the skin in ux_srss)
    console.log({
        req: 'ux_sdl',
        ip: parseForwarded(req.headers['x-forwarded-for']),
        time: Date.now(),
        xbox: parseUa(req.headers['user-agent'])
    })

    if (!req.params.skin) return res.status(404).send('');

    const id = parseInt(req.params.skin)
    if (id > skinIndex.length - 1 || id < 0 || isNaN(id)) return res.status(404).send('');
    
    if(skinCache[id]?.zip) {
        skinCache[id] = { ...skinCache[id], expires: Date.now()+300000 }
        res.contentType('application/zip')
        return res.send(skinCache[id].zip);
    }

    var response = await fetch(skinIndex[id].download)
    if (!response.ok) return res.status(404).send('');

    var buffer = Buffer.from(await response.arrayBuffer())
    skinCache[id] = { ...skinCache[id], zip: buffer, expires: Date.now()+300000 }

    res.contentType('application/zip')
    res.send(buffer)
})

app.get('/downloads/thumbs/:skin', async (req, res) => { //sends a thumbnail of the skin, skins are supposed to have a file in them for this so it reads through the files and tries to find it
    console.log({
        req: 'ux_simg',
        ip: parseForwarded(req.headers['x-forwarded-for']),
        time: Date.now(),
        xbox: parseUa(req.headers['user-agent'])
    })

    if (!req.params.skin) return res.status(404).send('');

    const id = parseInt(req.params.skin)
    if (id > skinIndex.length - 1 || id < 0 || isNaN(id)) return res.status(404).send('');

    if(skinCache[id]?.thumbnailFile) {
        skinCache[id] = { ...skinCache[id], expires: Date.now()+300000 }
        if(skinCache[id].thumbnailFile === 'no_thumbnail') return res.status(200).send('')
        res.contentType(skinCache[id].thumbnailMimeType)
        return res.send(skinCache[id].thumbnailFile);
    }

    if(skinCache[id]?.zip) {
        skinCache[id] = { ...skinCache[id], expires: Date.now()+300000 }
        var zip = new AdmZip(skinCache[id].zip)
    } else {
        var response = await fetch(skinIndex[id].download)
        if (!response.ok) return res.status(200).send(''); //200 because it breaks otherwise
    
        var buffer = Buffer.from(await response.arrayBuffer())
        skinCache[id] = { ...skinCache[id], zip: buffer, expires: Date.now()+300000 }
        var zip = new AdmZip(buffer)
    }

    var zipEntries = zip.getEntries()
    var validFormats = ['png', 'jpg', 'jpeg', 'bmp']

    for (let i = 0; i < Object.values(zipEntries).length; i++) {
        const entry = Object.values(zipEntries)[i]
        const entryName = entry.entryName.toLowerCase().split('/')[entry.entryName.toLowerCase().split('/').length - 1]
        const entryExtension = entryName.split('.')[entryName.split('.').length - 1]

        if ((entryName.startsWith('preview') || entryName.startsWith('screenshot')) && validFormats.includes(entryExtension)) {
            var thumbnailBuffer = entry.getData()
            skinCache[id] = { ...skinCache[id], thumbnailFile: thumbnailBuffer, thumbnailMimeType: 'image/' + entryExtension, expires: Date.now()+300000 }
            res.contentType('image/' + entryExtension)
            res.send(entry.getData())
            break;
        }
        
        if (i >= Object.values(zipEntries).length - 1) {
            skinCache[id] = { ...skinCache[id], thumbnailFile: 'no_thumbnail', thumbnailMimeType: 'no_thumbnail', expires: Date.now()+300000 }
            res.status(200).send('')
            break;
        }
    }
})

//preview downloader
app.get('/games/xml/:titleid.xml', async (req, res) => { //sends an xml file from a game's title id
    console.log({
        req: 'ux_ptid',
        ip: parseForwarded(req.headers['x-forwarded-for']),
        time: Date.now(),
        xbox: parseUa(req.headers['user-agent'])
    })

    var titleId = encodeURIComponent(req.params.titleid.toUpperCase())
    if (titleId.length != 8) return res.status(200).send(''); //200 on these because instead of requesting it to be added (not a feature never will be) itll just say it doesnt exist
    if (isNaN(parseInt(titleId, 16))) return res.status(200).send('');
    if (!titleIds[titleId]) return res.status(200).send('');

    var info = titleIds[titleId]
    var videoId = 0
    for (let i = 0; i < previewIndex.length; i++) {
        if (previewIndex[i].toLowerCase().replace(/[^\w\s]/gi, '').replace(/\s+/g, ' ').trim().slice(0, -3) === info.title.toLowerCase().replace(/[^\w\s]/gi, '').replace(/\s+/g, ' ').trim()) {
            videoId = i + 1
        }
    }

    res.contentType('text/xml')
    //res.send(`<gdbase><xbg title="${info.title}" decid="${parseInt(titleid, 16)}" hexid="${titleid}" cover="0" thumb="0" md5="" size="" liveenabled="0" systemlink="0" patchtype="0" players="0" customsoundtracks="0" genre="" esrb="" publisher="" developer="" region="0" rc="0" video="1" vc="0" vidid="${vidid}"/></gdbase>`)
    res.send(`<gdbase><xbg title="${htmlEncode(info.title)}" decid="${parseInt(titleId, 16)}" hexid="${titleId}" video="${0-(videoId>0)}" vidid="${videoId}"/></gdbase>`)
})

app.get('/games/sendvid.php', async (req, res) => { //sends a preview of a game by it's id
    console.log({
        req: 'ux_pvid',
        ip: parseForwarded(req.headers['x-forwarded-for']),
        time: Date.now(),
        xbox: parseUa(req.headers['user-agent'])
    })

    if (parseUa(req.headers['user-agent']) === undefined) return res.redirect(req.url)

    var videoId = parseInt(req.query.sid) - 1
    if (isNaN(videoId)) return res.status(404).send('')
    if (!previewIndex[videoId]) return res.status(404).send('')

    var response = await fetch(`https://raw.githubusercontent.com/whakama/xbox-previews-archive/main/${encodeURIComponent(previewIndex[videoId])}`)
    if (!response.ok) return res.status(404).send('')

    var buffer = Buffer.from(await response.arrayBuffer())

    res.send(buffer)
})

//misc
app.get('/404/:message', (req, res) => { //unleashx will output :message due to it being the text after the last slash
    res.status(404).send('')
})

app.all('*', (req, res) => { //since its after everything it just 404s shit that isnt in this file/public dir
    res.status(404).send('')
})

app.use((error, req, res, next) => { //error handler so i dont accidentally leak anything/mess with an xbox in a weird way lol
    console.log(`error on ${req.path}: ${error.message}`)
    res.status(500).send('')
})

app.listen(14380, () => {
    console.log('listening on port 14380')
})

console.log('starting')