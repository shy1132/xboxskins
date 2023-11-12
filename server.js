process.on('uncaughtException', function(exception) {
    console.log(exception.stack)
})

//requires
const HyperExpress = require('hyper-express')
const LiveDirectory = require('live-directory')
const AdmZip = require('adm-zip')
const fs = require('fs')
const path = require('path')
const titleIds = require('./files/titleIds.json')

//setups
if (!fs.existsSync('./files/skins')) return console.log('no skins folder in ./files/skins!');
if (!fs.existsSync('./files/previews')) return console.log('no previews folder in ./files/previews!');

const app = new HyperExpress.Server()
const static = new LiveDirectory(path.resolve('./public'), {
    keep: {
        extensions: ['.html', '.txt', '.jpg']
    },
    ignore: (path) => {
        return path.startsWith('.'); //ignore dotfiles
    }
})

//variables
var skinIndex = []
var skinsRssXml = ''
var previewIndex = []

//functions
function logRequest(endpoint = 'unknown', req) {
    var ip = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[req.headers['x-forwarded-for'].split(',').length - 1].trim() : 'unknown'; //if there is a forwarded for ip sent by the reverse proxy, parse it (apache usually puts a comma if you add that header manually) to only return the ip
    var xbox = req.headers['user-agent']?.startsWith('Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1'); //if the ua starts with this, it's unleashX
    var date = new Date().toISOString()

    console.log(`[${date}] ${endpoint} | ${xbox ? 'on xbox' : 'not on xbox'} | from ${ip}`)
    return true;
}

function htmlEncode(str) {
    return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function rssEntry(title, link, thumb) {
    //validate link and if its invalid, just make it a placeholder
    try {
        if (link) link = new URL(link).href
    } catch {
        link = 'http://www.xbox-skins.net/404/error'
    }

    //same but for thumbnail
    try {
        if (thumb) thumb = new URL(thumb).href
    } catch {
        thumb = 'http://www.xbox-skins.net/thumb.jpg'
    }

    return `<item><title>${htmlEncode(title)}</title><link>${link}</link><thumb>${thumb}</thumb></item>`;
}

async function initialize() {
    console.log('getting list of skins and previews')

    var skinFiles = await fs.promises.readdir('./files/skins/')
    var previewFiles = await fs.promises.readdir('./files/previews/')

    for (let i = 0; i < skinFiles.length; i++) {
        let name = skinFiles[i]
        skinIndex.push({
            name,
            path: path.resolve(`./files/skins/${name}`),
            id: i
        })
    }

    for (let i = 0; i < previewFiles.length; i++) {
        let name = previewFiles[i]
        previewIndex.push({
            name,
            path: path.resolve(`./files/previews/${name}`),
            id: i
        })
    }

    console.log('finished indexing skins and previews')

    console.log('compiling skin index to xml for ux_rss endpoint')

    var items = [ //this will always show at the top, so i put some information here for anyone confused (since its just a giant list of skins)
        rssEntry(`! unofficial UnleashX skin downloader (should work properly again)`, 'http://www.xbox-skins.net/404/this_is_not_a_skin', 'http://www.xbox-skins.net/thumb.jpg'),
        rssEntry('!! see www.xbox-skins.net in your browser for more information', 'http://www.xbox-skins.net/404/this_is_not_a_skin', 'http://www.xbox-skins.net/thumb.jpg'),
        rssEntry('!!! ------------------------------------------------------------------------------------------- !!!', 'http://www.xbox-skins.net/404/this_is_not_a_skin', 'http://www.xbox-skins.net/thumb.jpg')
    ]

    var nsfwItems = []

    for (let i = 0; i < skinIndex.length; i++) {
        var file = skinIndex[i]
        var fileName = path.basename(file.name, path.extname(file.name))

        if (fileName.includes('[NSFW]')) { //every nsfw skin has "[NSFW]" before the name
            nsfwItems.push(rssEntry(`~${fileName}`, `http://www.xbox-skins.net/downloads/skins/${file.id}.zip`, `http://www.xbox-skins.net/downloads/skinThumbs/${file.id}.jpg`)) //~ before fileName to shove it down to the bottom, past all the other non nsfw skins
        } else {
            items.push(rssEntry(fileName, `http://www.xbox-skins.net/downloads/skins/${file.id}.zip`, `http://www.xbox-skins.net/downloads/skinThumbs/${file.id}.jpg`))
        }
    }

    items = items.concat(nsfwItems) //just to make sure that nsfw items are indeed at the bottom (this sorts it as items, nsfwItems)
    skinsRssXml = `<?xml version='1.0'?><!DOCTYPE rss PUBLIC "-//Netscape Communications//DTD RSS 0.91//E" "http://my.netscape.com/publish/formats/rss-0.91.dtd"><rss version="0.91"><channel><title>www.xbox-skins.net replacement server</title><link>http://www.xbox-skins.net</link><language>en-us</language>${items.join('')}</channel></rss>`

    console.log('finished compiling skin index to xml')
}

initialize()

//code
//skin downloader
app.get('/rss/uxdash.php', async (req, res) => { //sends a giant xml of all the skins in the db (this has nothing to do with php but the original website used php)
    logRequest('ux_rss', req)

    res.setHeader('Content-Type', 'text/xml')
    res.send(skinsRssXml)
})

app.get('/downloads/skins/:skin', async (req, res) => { //sends the zip file for a skin by it's id (obtained from the index of the skin in ux_srss)
    logRequest('ux_skin', req)

    var id = parseInt(req.params.skin) //will remove any extensions or such
    if (id > skinIndex.length - 1 || id < 0 || isNaN(id)) return res.status(404).send('');

    var readStream = fs.createReadStream(skinIndex[id].path)
    var fileSize = (await fs.promises.stat(skinIndex[id].path)).size

    res.setHeader('Content-Type', 'application/zip')
    res.stream(readStream, fileSize)
})

app.get('/downloads/skinThumbs/:skin', async (req, res) => { //sends a thumbnail of the skin, skins are supposed to have a file in them for this so it reads through the files and tries to find it (img previews NEED a .jpg extension to work for some reason)
    logRequest('ux_thumb', req)

    var id = parseInt(req.params.skin)
    if (id > skinIndex.length - 1 || id < 0 || isNaN(id)) return res.status(404).send('');

    var buffer = await fs.promises.readFile(skinIndex[id].path)
    var zip = new AdmZip(buffer)
    var zipEntries = zip.getEntries()
    var validFormats = ['png', 'jpg', 'jpeg', 'bmp']
    var contenders = []

    for (let entry of Object.values(zipEntries)) {
        let entryName = path.basename(entry.entryName.toLowerCase())
        let entryExtension = path.extname(entryName).slice(1)
    
        if (validFormats.includes(entryExtension)) {
            if (entryName.startsWith('preview') || entryName.startsWith('screenshot')) {
                entry.getDataAsync((data, err) => {
                    if (err) return res.status(200).send('');
                    res.setHeader('Content-Type', 'image/' + entryExtension)
                    res.send(data)
                })
                return;
            } else {
                contenders.push(entry)
            }
        }
    }

    if (contenders.length > 0) {
        var contenderEntry = contenders[0]
        var contenderEntryName = path.basename(contenderEntry.entryName.toLowerCase())
        var contenderEntryExtension = path.extname(contenderEntryName).slice(1)

        contenderEntry.getDataAsync((data, err) => {
            if (err) return res.status(200).send('');
            res.setHeader('Content-Type', 'image/' + contenderEntryExtension)
            res.send(data)
        })
    } else {
        res.status(200).send('')
    }
})

//preview downloader
app.get('/games/xml/:titleId', async (req, res) => { //sends an xml file from a game's title id
    logRequest('ux_game', req)

    var titleIdParsed = parseInt(req.params.titleId, 16).toString(16).toUpperCase() //will remove any extensions or anything like that
    var titleId = encodeURIComponent(titleIdParsed)
    if (titleId.length != 8) return res.status(200).send(''); //200 on these because instead of requesting it to be added (not a feature never will be) itll just say it doesnt exist
    if (isNaN(parseInt(titleId, 16))) return res.status(200).send('');
    if (!titleIds[titleId]) return res.status(200).send('');

    var info = titleIds[titleId]
    var videoId = 0
    for (let i = 0; i < previewIndex.length; i++) {
        if (previewIndex[i].name.toLowerCase().replace(/[^\w\s]/gi, '').replace(/\s+/g, ' ').trim().slice(0, -3) === info.title.toLowerCase().replace(/[^\w\s]/gi, '').replace(/\s+/g, ' ').trim()) {
            videoId = (i + 1)
            break;
        }
    }

    res.setHeader('Content-Type', 'text/xml')
    res.send(`<gdbase><xbg title="${htmlEncode(info.title)}" decid="${parseInt(titleId, 16)}" hexid="${titleId}" video="${videoId ? -1 : 0}" vidid="${videoId}"/></gdbase>`)
    //res.send(`<gdbase><xbg title="${info.title}" decid="${parseInt(titleid, 16)}" hexid="${titleid}" cover="0" thumb="0" md5="" size="" liveenabled="0" systemlink="0" patchtype="0" players="0" customsoundtracks="0" genre="" esrb="" publisher="" developer="" region="0" rc="0" video="1" vc="0" vidid="0"/></gdbase>`)
})

app.get('/games/sendvid.php', async (req, res) => { //sends a preview of a game by it's id
    logRequest('ux_vid', req)

    if (!req.headers['user-agent']) return res.redirect(req.url); //weird unleashx bug where it doesnt send a user agent sometimes, you just gotta try again

    var videoId = parseInt(req.query.sid) - 1
    if (isNaN(videoId)) return res.status(404).send('');
    if (!previewIndex[videoId]) return res.status(404).send('');

    var fileSize = (await fs.promises.stat(previewIndex[videoId].path)).size
    var readStream = fs.createReadStream(previewIndex[videoId].path)

    res.setHeader('Content-Type', 'video/x-ms-wmv')
    res.stream(readStream, fileSize)
})

//misc
app.get('/*', async (req, res) => { //frontend
    var reqPath = req.path
    if (reqPath === '/') reqPath = '/index.html';

    var file = static.get(reqPath)
    if (file === undefined) return res.status(404).send('');

    var fileType = path.extname(file.path)
    res.type(fileType).send(file.content)
})

app.get('/404/:message', (req, res) => { //unleashX will output :message due to it being the text after the last slash
    res.status(404).send('')
})

app.all('*', async (req, res) => { //catch-all, since its last itll just 404 everything else silently
    res.status(404).send('')
})

app.listen(14380).then(() => console.log('listening on port 14380'))

console.log('starting')