//requires
const config = require('./config.json')

let express;
if (config.proxyRewritesHttpVersion) {
    console.log('using ultimate-express')
    express = require('ultimate-express')
} else {
    console.log('using regular express')
    express = require('express')
}

const AdmZip = require('adm-zip')
const fs = require('fs')
const path = require('path')
const titleIds = require('./files/titleIds.json')

//setups
if (!fs.existsSync('./files/skins')) return console.log('no skins folder in ./files/skins!');
if (!fs.existsSync('./files/previews')) return console.log('no previews folder in ./files/previews!');

const app = express()
app.use(express.static('public'))
app.set('etag', false)
app.disable('x-powered-by')

//variables
const baseUrl = config.baseUrl || 'http://www.xbox-skins.net'
let skinIndex = []
let skinsRssXml = ''
let previewIndex = []

//functions
function logRequest(endpoint = 'unknown', req) {
    if (!config.logging) return;
    try {
        let origin;
        if (config.cloudflareMode) {
            let ip = req.headers['cf-connecting-ip'] || 'unknown';
            let countryCode = req.headers['cf-ipcountry'] || 'unknown';
            origin = `${ip} (${countryCode})`
        } else if (req.headers['x-forwarded-for']) {
            let forwardedFor = req.headers['x-forwarded-for']
            let forwardedForSplit = forwardedFor.split(',')
            origin = forwardedForSplit[forwardedForSplit.length - 1].trim() //parse the forwarded for ip (apache usually puts a comma if the client adds that header manually, so we get the first ip that the reverse proxy sent)
        } else {
            origin = 'unknown';
        }

        let onXbox = req.headers['user-agent']?.startsWith('Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1'); //if the ua starts with this, it's unleashX
        let date = new Date().toISOString()

        console.log(`[${date}] ${endpoint} | ${onXbox ? 'on xbox' : 'not on xbox'} | from ${origin}`)
        return true;
    } catch (err) {
        console.error('failed to parse and log request', req, err)
        return false;
    }
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
        link = baseUrl + '/404/error'
    }

    //same but for thumbnail
    try {
        if (thumb) thumb = new URL(thumb).href
    } catch {
        thumb = baseUrl + '/thumb.jpg'
    }

    return `<item><title>${htmlEncode(title)}</title><link>${link}</link><thumb>${thumb}</thumb></item>`;
}

async function initialize() {
    console.log('getting list of skins and previews')

    let skinFiles = await fs.promises.readdir('./files/skins/')
    let previewFiles = await fs.promises.readdir('./files/previews/')

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

    let items = [ //this will always show at the top, so i put some information here for anyone confused (since its just a giant list of skins)
        rssEntry('! unofficial UnleashX skin downloader', `${baseUrl}/404/this_is_not_a_skin`, `${baseUrl}/thumb.jpg`),
        rssEntry('!! see www.xbox-skins.net in your browser for more information', `${baseUrl}/404/this_is_not_a_skin`, `${baseUrl}/thumb.jpg`),
        rssEntry('!!! ------------------------------------------------------------------------------------------- !!!', `${baseUrl}/404/this_is_not_a_skin`, `${baseUrl}/thumb.jpg`)
    ]

    let nsfwItems = []

    for (let i = 0; i < skinIndex.length; i++) {
        let file = skinIndex[i]
        let fileName = path.basename(file.name, path.extname(file.name))

        if (fileName.includes('[NSFW]')) { //every nsfw skin has "[NSFW]" after the name
            nsfwItems.push(rssEntry(`~${fileName}`, `${baseUrl}/downloads/skins/${file.id}.zip`, `${baseUrl}/downloads/skinThumbs/${file.id}.jpg`)) //~ before fileName to shove it down to the bottom, past all the other non nsfw skins
        } else {
            items.push(rssEntry(fileName, `${baseUrl}/downloads/skins/${file.id}.zip`, `${baseUrl}/downloads/skinThumbs/${file.id}.jpg`))
        }
    }

    items = items.concat(nsfwItems) //just to make sure that nsfw items are indeed at the bottom (this sorts it as items, nsfwItems)
    skinsRssXml = `<?xml version='1.0'?><!DOCTYPE rss PUBLIC "-//Netscape Communications//DTD RSS 0.91//E" "http://my.netscape.com/publish/formats/rss-0.91.dtd"><rss version="0.91"><channel><title>www.xbox-skins.net replacement server</title><link>http://www.xbox-skins.net</link><language>en-us</language>${items.join('')}</channel></rss>`

    console.log('finished compiling skin index to xml')
}

initialize()

//code
//skin downloader
app.get('/rss/uxdash.php', (req, res) => { //sends a giant xml of all the skins in the db (this has nothing to do with php but the original website used php)
    try {
        logRequest('ux_rss', req)

        res.setHeader('Content-Type', 'text/xml')
        res.send(skinsRssXml)
    } catch (err) {
        console.error('error in ux_rss:', err)
        res.status(500).send('')
    }
})

app.get('/downloads/skins/:skin', async (req, res) => { //sends the zip file for a skin by it's id (obtained from the index of the skin in ux_rss)
    try {
        logRequest('ux_skin', req)

        let id = parseInt(req.params.skin) //will remove any extensions or such
        if (id > skinIndex.length - 1 || id < 0 || isNaN(id)) return res.status(404).send('');

        res.sendFile(skinIndex[id].path)
    } catch (err) {
        console.error('error in ux_skin:', err)
        res.status(500).send('')
    }
})

app.get('/downloads/skinThumbs/:skin', async (req, res) => { //sends a thumbnail of the skin, skins are supposed to have a file in them for this so it reads through the files and tries to find it (img previews NEED a .jpg extension to work for some reason)
    try {
        logRequest('ux_thumb', req)

        let id = parseInt(req.params.skin)
        if (id > skinIndex.length - 1 || id < 0 || isNaN(id)) return res.status(404).send('');

        let formats = {
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'bmp': 'image/bmp'
        }

        let buffer = await fs.promises.readFile(skinIndex[id].path)
        let zip = new AdmZip(buffer)
        let zipEntries = zip.getEntries()

        let contenders = []
        let foundPreview = false;

        for (let entry of Object.values(zipEntries)) {
            let entryName = path.basename(entry.entryName.toLowerCase())
            let entryExtension = path.extname(entryName).slice(1)

            if (entryExtension in formats) {
                if (entryName.startsWith('preview') || entryName.startsWith('screenshot')) {
                    foundPreview = true;

                    entry.getDataAsync((data, err) => {
                        if (err) return res.status(200).send('');
                        res.setHeader('Content-Type', formats[entryExtension])
                        res.send(data)
                    })

                    break;
                } else {
                    contenders.push(entry)
                }
            }
        }

        if (contenders.length > 0 && !foundPreview) {
            let largestContenderEntry = contenders.reduce((maxSizeContender, currentContender) => { //find the largest one (most likely to be a preview or a background of the skin which is sort of a preview)
                let currentSize = currentContender.header.size
                return currentSize > maxSizeContender.header.size ? currentContender : maxSizeContender;
            }, contenders[0])

            let contenderEntryName = path.basename(largestContenderEntry.entryName.toLowerCase())
            let contenderEntryExtension = path.extname(contenderEntryName).slice(1)

            largestContenderEntry.getDataAsync((data, err) => {
                if (err) return res.status(200).send('');
                res.setHeader('Content-Type', formats[contenderEntryExtension])
                res.send(data)
            })
        } else if (contenders.length < 1 && !foundPreview) {
            res.status(200).send('')
        }
    } catch (err) {
        console.error('error in ux_thumb:', err)
        res.status(500).send('')
    }
})

//preview downloader
app.get('/games/xml/:titleId', async (req, res) => { //sends an xml file from a game's title id
    try {
        logRequest('ux_game', req)

        let titleIdParsed = parseInt(req.params.titleId, 16).toString(16).toUpperCase() //will remove any extensions or anything like that
        let titleId = encodeURIComponent(titleIdParsed)
        if (titleId.length != 8) return res.status(200).send(''); //200 on these because instead of requesting it to be added (not a feature never will be) itll just say it doesnt exist
        if (isNaN(parseInt(titleId, 16))) return res.status(200).send('');
        if (!titleIds[titleId] || !titleIds[titleId].title || !titleIds[titleId].tid) return res.status(200).send('');

        let info = titleIds[titleId]
        let videoId = 0
        for (let i = 0; i < previewIndex.length; i++) {
            let cleanSourceName = previewIndex[i].name.toLowerCase().replace(/[^\w\s]/gi, '').replace(/\s+/g, ' ').trim().slice(0, -3)
            let cleanTargetName = info.title.toLowerCase().replace(/[^\w\s]/gi, '').replace(/\s+/g, ' ').trim()

            if (cleanSourceName === cleanTargetName) {
                videoId = (i + 1)
                break;
            }
        }

        res.setHeader('Content-Type', 'text/xml')
        res.send(`<gdbase><xbg title="${htmlEncode(info.title)}" decid="${parseInt(info.tid, 16)}" hexid="${info.tid}" video="${videoId ? -1 : 0}" vidid="${videoId}"/></gdbase>`)
        //res.send(`<gdbase><xbg title="title" decid="00000000" hexid="00000000" cover="0" thumb="0" md5="" size="" liveenabled="0" systemlink="0" patchtype="0" players="0" customsoundtracks="0" genre="" esrb="" publisher="" developer="" region="0" rc="0" video="1" vc="0" vidid="0"/></gdbase>`)
    } catch (err) {
        console.error('error in ux_game:', err)
        res.status(500).send('')
    }
})

app.get('/games/sendvid.php', async (req, res) => { //sends a preview of a game by it's id
    try {
        logRequest('ux_vid', req)

        if (!req.headers['user-agent']) return res.redirect(req.url); //weird unleashx bug where it doesnt send request with a user agent sometimes and also wont do anything with the response, you just gotta try again

        let videoId = parseInt(req.query.sid) - 1
        if (isNaN(videoId)) return res.status(404).send('');
        if (!previewIndex[videoId]) return res.status(404).send('');

        res.sendFile(previewIndex[videoId].path)
    } catch (err) {
        console.error('error in ux_vid:', err)
        res.status(500).send('')
    }
})

//misc
app.get('/404/:message', (req, res) => { //unleashX will output :message due to it being the text after the last slash
    res.status(404).send('')
})

app.all('*', async (req, res) => { //catch-all, since its last itll just 404 everything else silently
    res.status(404).send('')
})

app.listen(14380, () => {
    console.log('listening on port 14380')
})

console.log('starting')