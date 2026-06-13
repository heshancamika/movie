const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const config = require('./config');

const app = express();

// 🛠️ Axios Client එක සෙට් කිරීම
const client = axios.create({
    baseURL: config.SITE_URL,
    timeout: 15000,
    headers: {
        'User-Agent': config.USER_AGENT,
        'Cookie': config.COOKIE,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    }
});

// 📥 Sinhalasub මූවී පේජ් URL එක ඇතුළෙන් හැම Quality එකකම ලින්ක්ස් සහ සයිස් ඇදලා ගන්නා කොටස
async function scrapeAllLinks(pageUrl) {
    try {
        const { data } = await client.get(pageUrl);
        const $ = cheerio.load(data);
        
        let results = [];
        
        // පේජ් එකේ ප්‍රධාන Title එක (මූවී එකේ නම) ගන්නවා
        const pageTitle = $('h1.entry-title').text().trim() || $('title').text().trim();

        // පේජ් එකේ තියෙන ඔක්කොම ලින්ක්ස් ලූප් කරනවා
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            
            // Pixeldrain ලින්ක්ස් විතරක් ෆිල්ටර් කරගන්නවා
            if (href && href.includes('pixeldrain.com/u/')) {
                const linkText = $(el).text().trim();
                let quality = "Unknown";
                let size = "Unknown";

                // Quality එක වෙන් කරගැනීම
                if (linkText.includes('1080p')) quality = 'FHD 1080p';
                else if (linkText.includes('720p')) quality = 'HD 720p';
                else if (linkText.includes('480p')) quality = 'SD 480p';

                // වරහන් ඇතුළේ තියෙන ෆයිල් සයිස් එක වෙන් කරගැනීම (RegEx මඟින්)
                const sizeMatch = linkText.match(/\(([^)]+)\)/);
                if (sizeMatch && sizeMatch[1]) {
                    size = sizeMatch[1];
                }

                // Pixeldrain View Link එක Direct Download API එකක් බවට හැරවීම
                const directUrl = href.replace('/u/', '/api/file/');

                results.push({
                    quality: quality,
                    size: size,
                    download_url: directUrl
                });
            }
        });

        return { pageTitle, results };
    } catch (error) {
        console.error("📥 Scraping Links Error:", error.message);
        return null;
    }
}

// 🌐 New API Endpoint (ඔයා ඉල්ලපු විදිහටම /api/movie වෙනුවට ලස්සනට හැදුවා)
app.get('/sinhala-sub-download', async (req, res) => {
    const targetUrl = req.query.url; // 👈 ?url= එකෙන් එන ලින්ක් එක ගන්නවා
    
    // යූසර් ලින්ක් එක දීලා නැත්නම් හෝ වැරදි ලින්ක් එකක් නම්
    if (!targetUrl || !targetUrl.includes('sinhalasub.lk/')) {
        return res.status(400).json({ 
            status: false, 
            error: "කරුණාකර නිවැරදි Sinhalasub මූවී ලින්ක් එකක් ඇතුළත් කරන්න. Example: /sinhala-sub-download?url=https://sinhalasub.lk/movies/..." 
        });
    }

    console.log(`🔗 Scraping Request Received for URL: ${targetUrl}`);
    
    // ලින්ක් එක ඇතුළෙන් ඩේටා ටික ස්ක්‍රේප් කිරීම
    const scrapeData = await scrapeAllLinks(targetUrl);
    
    if (!scrapeData || scrapeData.results.length === 0) {
        return res.json({ 
            status: false, 
            message: "මෙම ලින්ක් එකෙන් ඩවුන්ලෝඩ් ලින්ක්ස් ලබා ගැනීමට නොහැකි විය. කරුණාකර ලින්ක් එක නිවැරදිදැයි පරීක්ෂා කරන්න." 
        });
    }

    // 🚀 ඔයා ඉල්ලපු Format එකටම JSON Response එක දීම
    res.json({
        status: true,
        owner: "@KingPoddaModz",
        title: scrapeData.pageTitle,
        result: scrapeData.results
    });
});

// සර්වර් එක ස්ටාර්ට් කිරීම
app.listen(config.PORT, () => {
    console.log(`🚀 Clean URL Scraper API is running on port ${config.PORT}`);
});
